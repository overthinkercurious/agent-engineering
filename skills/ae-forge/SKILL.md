---
name: ae-forge
description: >
  Takes a software request from problem to implemented and verified result
  using a small, risk-sized team. Use for features, bugs,
  refactors, performance work, security work, technical planning, code review,
  or continuing an existing Agent Engineering task. The user provides the
  outcome; Forge selects the experts, coordinates their work, implements the
  change, runs the project's checks, repairs findings, and reports the result.
metadata:
  owns: "delivering a software outcome through an autonomous specialist team"
---

# Forge a software outcome

Turn the user's request into working, verified software. The user should not
need to understand the workflow, choose agents, prepare artifacts, or run Forge
commands.

Read `references/team.md` for the shared contract and `references/team.json`
for routing. Then read only each selected workflow named by its `file` field.
Do not load workflows for experts who were not selected.

`team.md`'s lens-selection section (and `team.json`'s `lenses` block) attach
every matching domain lens per selected role from `references/lenses/`.
Lenses add platform/protocol depth; they never replace a role's own file.
Load only the lenses actually attached — `references/lenses/_index.md` lists
what exists versus what's still backlog.

## Operating promise

1. Understand the request and the repository.
2. Select the smallest team that covers the risk.
3. Produce an evidence-backed plan and review it independently. Add Challenger for deeper risk.
4. Implement requested changes; for read-only requests, deliver the assessment without editing code.
5. Have a verifier inspect the result separately and run relevant checks.
6. Repair valid findings, then report what changed and what remains uncertain.

Keep coordination internal. Give the user short progress updates and ask only
when a decision would materially change the outcome or requires new authority.

## Start or resume

Resolve the installed skill directory once:

```bash
AE="${AE_SKILL_DIR:-${CLAUDE_SKILL_DIR:-}}"
[ -n "$AE" ] || for d in .claude/skills/ae-forge .agents/skills/ae-forge \
                         .gemini/skills/ae-forge .agent/skills/ae-forge; do
  [ -f "$d/SKILL.md" ] && AE="$d" && break
done
[ -n "$AE" ] && [ -f "$AE/scripts/forge.mjs" ] \
  && printf 'ae-forge: %s\n' "$AE" \
  || printf 'AE-FORGE UNRESOLVED\n'
```

**If that prints `AE-FORGE UNRESOLVED`, stop and say so.** Do not continue from
memory. Every gate in this file — routing, approval, the audit, the completion
checks — lives in `scripts/`, so a run without them is not a lighter-weight
Forge run, it is an ungoverned one that still reports itself as a Forge run.
Say the directory could not be resolved, print the restore command
(`npx skills@1.7.0 add overthinkercurious/agent-engineering --agent <AGENT_ID>
--copy -y`, or set `AE_SKILL_DIR`), and end the turn. A shell that cannot run
the resolution at all is the same condition.

Inspect the project instructions and current work. Before a **new** Forge run,
check for `.dev/knowledge/00-index.md`, the five knowledge documents, and
`.dev/rules/00-index.md`. If
they are missing, run the sibling `ae-surveyor` skill through its six stages
first, including verification and the final index. Tell the user that the
first survey is in progress. Do not substitute `analyze.mjs` for a complete
survey. Resume an existing Forge run without repeating this first-run step.
`forge.mjs start` checks that the durable knowledge exists and explains the
missing prerequisite when it does not. If Surveyor is unavailable or fails,
report the reason and stop this new run; do not claim it was surveyed.

Runs created before contract v5 cannot enter implementation because they lack
the mandatory user-plan-approval record. Return them to planning and create a
new current-contract run rather than treating a historic internal review as current user
authorization.

Runs created before contract v6 also cannot enter repair: they lack the
mandatory user approval that bounds a repair to the verifier finding. Return
them to Plan and create a current-contract run rather than applying a repair
outside a recorded decision.

Build the repository map **once per run**, before any expert starts, and give
every expert the same map:

```bash
# ae-surveyor installs as a sibling of this skill; use its analyzer when present.
SV="$(dirname "$AE")/ae-surveyor"
if [ -f "$SV/scripts/analyze.mjs" ]; then
  node "$SV/scripts/analyze.mjs" --budget-tokens 60000
fi
```

`--budget-tokens` sizes the analyzer's suggested reading set, not the run's
total context or an expert's permission to inspect source. Check
`selection.deferred_high_signal` and `selection.deferred_control_files` in the
fresh analysis. Read any deferred file needed to answer the request or verify
a changed boundary, and record what remained unread. Increase the estimate or
inspect a targeted area when the selection misses important files; never treat
the estimate as a quality ceiling or a reason to end the task.

Read `.dev/knowledge/00-index.md` first and follow it to the one or two
relevant documents. Compare its source fingerprint with the fresh analysis;
stale knowledge is a reading lead, not current evidence. If analysis is
unavailable or its schema is incompatible, inspect the repository directly and
report the gap.

**Explore the repository once.** Isolated experts start with a clean context
window, so an unbudgeted "go read the code" instruction is paid again by every
expert on the team. Give each expert the ranked file list and the paths its own
boundary needs, and let it open only what its question requires. A five-role
run should read the repository once, not five times.

First list current runs. Resume only a clearly matching active run; otherwise
create one small record. Skip the record for explanation-only work.

```bash
node "$AE/scripts/forge.mjs" list
node "$AE/scripts/forge.mjs" start --title "<request>" --kind <kind> \
  --risk <comma-list|none> \
  [--cause known --cause-evidence <repro-or-code-evidence>] \
  [--signals <comma-list>] [--domain <comma-list>] [--depth standard|deep]
```

`--signals` passes vocabulary the user actually used. Signals may add a
specialist but never remove a risk-selected role. Every delivery uses Architect
and Plan Reviewer; deep delivery adds Challenger. For
bugs and performance work, skip Investigator only when the cause is
demonstrated with `--cause-evidence`.

### Assess risk before starting

`--risk` is the router, and it is not optional. Answer each question about the
behavior the change introduces, not about filenames, and pass every flag that
is true — or `none` when none are:

| Flag | Answer yes when the change… |
|---|---|
| `access` | changes who can read, do, or reach anything — authentication, authorization, tenancy, secrets, payments |
| `stored-shape` | changes the shape of persisted data, or moves or deletes existing data |
| `rendered` | changes a rendered surface or a user journey |
| `runtime` | changes external calls, concurrency, retries, or a performance budget |
| `irreversible` | is destructive, production-affecting, spends money, or changes a public contract |

Each flag deterministically selects its expert, so the vocabulary of the
request never decides whether a review happens. **An empty risk set is not
evidence of safety** — it records that you assessed and found none. Omitting
`--risk` entirely is recorded as unassessed and reported to the user.

Domain depth adapts to the request and project: `lens-select.mjs` reads the
run's recorded request signals and domain hints, then the survey's sensor dump
and derives domain tags from what the repository actually
contains, so a Stripe dependency reaches the payments lens and an OpenAI
dependency reaches the AI/LLM lens without anyone naming them. Pass `--domain`
only for what the project cannot reveal — a target platform, a standard the
team has adopted but not yet imported. A miss there costs depth, never a
review.

Use `status --id <id>` to resume. Never make the user manage this record. It
is an internal recovery aid, not an approval bureaucracy.

Kinds are `idea`, `feature`, `bug`, `refactor`, `performance`, `security`,
`audit`, `plan`, `diagnose`, and `review`. The last four are read-only outcomes.

## Route the team

Classify by behavior and risk, not filenames:

Standard delivery uses Architect, Plan Reviewer, Builder, and Verifier. Deep
review adds Plan Challenger. It is required for access, stored-data shape,
irreversible work, security and idea requests, unknown causes, unassessed
risk, and listed high-impact domains. `--depth deep` can also be selected for
material design uncertainty. Add only relevant specialists.

### Print the routing decision

Before any expert works, print a compact routing decision from `start`:
its `contract` field, selected and skipped roles with reasons, attached
lenses, whether approval is required, and the reported enforcement mode.
Use those recorded values verbatim; never infer native enforcement or hide
an omitted review. See `team.md` for enforcement limits.

An audit-only request is different: select Auditor, Verifier and only the
relevant Security, Data, Experience, or Reliability expert. Do not add
Architect or Builder or edit code unless the user also asked for fixes. A release-readiness
review ("Release Auditor") is this same audit path with `kind: audit` — there
is no separate release role; scope it to the relevant specialists (Reliability
for rollout/observability, Security for exposure, Data for migration safety)
plus Verifier.

For `plan`, `diagnose`, or `review`, select the relevant expert and Verifier.
These runs cannot enter Build or Repair. A review judges an existing candidate;
an audit assesses the repository cold. Start a new delivery run if fixes are requested.

## Drive the stages, one at a time

Stages run **sequentially**. Never two at once, whatever this host can
dispatch: the stages that matter are adversarial in pairs — plan and its
review, build and its verification — and running a pair concurrently means the
reviewer judges a moving target.

Six stage skills are separately installed. Scaffold the artifact first, then
drive the selected roles in the order recorded by `start`. Selected specialists
give constraints after Architect. Plan Reviewer inspects every delivery plan;
deep runs then use Challenger. A REVISE returns it to Architect for a focused
revision and new selected review passes. On audit-only work, selected
specialists contribute before Auditor; Auditor performs its own cold read,
then Verifier assesses the combined findings:

```bash
node "$AE/scripts/forge.mjs" artifact --id <id>
```

Record Plan Reviewer's verdict and Challenger's when selected. Build requires
`APPROVED` or `APPROVED WITH NOTES` for every selected review pass on the
unchanged current plan.

| Stage | Skill | Writes section |
|---|---|---|
| Investigator | `ae-investigate` | `Investigation` |
| Architect | `ae-plan` | `Plan` |
| Plan Reviewer | `ae-plan-review` | `Plan review` |
| Plan Challenger | `ae-plan-review` | `Plan challenge` |
| Builder | `ae-build` | `Implementation` |
| Verifier | `ae-verify` | `Verification` |
| Auditor | `ae-audit` | `Audit` |

The five named specialists — Security, Data, Experience, Reliability, Product —
are not separate skills. They use `references/roles/` and write their own
result files and ledger notes. Forge supplies these results to downstream
stages; a named specialist does not need another public skill or artifact
section.

After Builder records its result, move the run to `verify` before dispatching
selected technical specialists for candidate review. Record their new result
files and notes, then dispatch Verifier last. After a repair, Builder records a
new result in the `repair` phase before Forge moves back to `verify`.

### How a stage is invoked

Prefer isolated dispatch where this host has it, one stage at a time:

```bash
cat .dev/context/host.json   # committed by ae-surveyor stage 1
```

Find **your own** row in `hosts` — you know which tool you are running as — and
use its `dispatch` value. Do not infer a dispatch capability from `detected_in_project`; that
field describes what this repository contains, not what is executing. If the
file is absent or your row is not in it, assume `none` and say which of the two
it was.

- **Isolation available** — dispatch the stage with its skill name, the run id,
  the artifact path, the exact repository scope, and the specialists and lenses
  attached to it. It inherits nothing else, which is the point.
- **No isolation** — execute each selected stage sequentially in this session.
  Load its stage skill and selected role method, write its result, and record
  the section before proceeding. Verifier reopens claims and runs checks
  independently, while the report records `same-session` review context.

### Session boundaries

At each review boundary, reopen every cited source and re-run the relevant
checks. A shared session does not provide context independence; record it on
Reviewer, Challenger, and Verifier notes. See `references/evaluation.md` for validation.

Forge is the sole coordinator. Planning and review stages are read-only.
Builder is the only stage that edits application code. Stages return to Forge
and never invoke one another.

Record what the lenses decided, so lens routing is as measurable as role
routing — the report renders from this:

```bash
node "$AE/scripts/forge.mjs" lenses --id <id> \
  --json "$(node "$AE/scripts/lens-select.mjs" --id <id>)"
```

Immediately before each selected role starts work, record its current focus:

```bash
node "$AE/scripts/forge.mjs" focus --id <id> --role <role> --summary "<what this role is doing now>"
```

Use this for same-session work as well as isolated dispatch. `focus` records
the current role, its stage skill, and attached lenses in `.dev/runs/<id>.md`.
`note` closes that focus and appends the completed contribution to the stage
log. `phase`, `lenses`, `approve`, `finish`, and `cancel` also refresh the live
status. During a long role, update `focus` when its work materially changes;
the displayed timestamp is the last recorded update, not a heartbeat.

Record material contributions with:

```bash
node "$AE/scripts/forge.mjs" note --id <id> --role <role> --summary "<result>"
```

For Reviewer, Challenger, and Verifier, add `--review-context isolated` only when the host actually
provided an isolated context; otherwise add `--review-context same-session`.

## Work autonomously

Work through investigation and planning autonomously. Standard runs proceed
from Plan to Build after a complete brief, constraints, and Plan Reviewer approval.
Deep runs show the reviewed plan and record explicit user approval before
Build. If the user already approved that exact plan in the active conversation,
record that decision without asking again.

**A reviewer verdict is not user approval.** An expert clearing its findings
says the change is sound; only the user says it is wanted. `approve` refuses a
role name as the approver for exactly this reason, and Builder checks the same
condition independently before it edits anything. Two keys, because a gate
enforced at one point is a gate one mistake opens.

Do not ask which file to edit, whether to write a test, how to name something,
or whether to run the project's checks. After Plan Challenger approves, show a
concise decision record: intended behavior, affected boundaries, alternatives
rejected, verification plan, residual risks, and every open question. Ask one
clear question: **“Approve this plan for implementation?”** Do not call
`approve` until the user explicitly answers yes.

Four actions are gated at the moment of action, every run, no matter what was
approved earlier: **pushing to a remote, merging, migrating a shared
environment, and anything that spends money.** Approval of a brief authorises
the change, never its release. These leave the machine or touch state other
people depend on, so a plan-time "yes" cannot cover them — the person saying
yes has not seen the diff yet. Editing files, running checks, and committing
locally are not in this set and need no separate approval.

Approval is a document and a user decision. Scaffold the brief and fill it,
then point the user at it:

```bash
node "$AE/scripts/forge.mjs" brief --id <id>
```

The brief always carries the decision and verification sections used by the
reviewer and challenger. Keep each concise: a four-page plan for a one-line
fix is a defect, not thoroughness.
Fill its `TODO` sections before Build. On deep runs, move to `approval` only
after both review passes approve the current plan. The ledger rejects an
unfinished brief and changes to an approved brief.

Record the user's decision with `approve --by <user> --basis
<decision-evidence>`. Approval is required for deep delivery runs. It freezes
both the brief and the exact Plan section; any change returns the work to Plan
Reviewer, Plan Challenger, and the user. Do not rewrite a frozen brief.

Write each expert's first full result to `.dev/work/<id>/results/<role>.md` and
give every later pass a new filename, such as `<role>-2.md`. Pass that path to
`note`. Recorded results are immutable; a correction is another pass, not an
overwrite. Downstream experts receive **paths and findings, never
transcripts** — that is what keeps coordination context bounded as the team
grows. Record a severity when an expert finds something:

```bash
node "$AE/scripts/forge.mjs" note --id <id> --role <role> \
  --summary "<result>" --severity <critical|high|medium|low|none> \
  --result .dev/work/<id>/results/<role>.md
```

After resolving or adjudicating a blocker, append that role's evidence and a
follow-up note with its remaining severity (`none` if clear). Omitting severity
does not clear an earlier blocker.

Use these phases internally:

1. **Understand:** inspect instructions, reproduce bugs, and identify unknowns.
2. **Plan:** state acceptance behavior and the smallest implementation path.
3. **Approval, deep runs:** render `approval-packet --id <id>`, show the
   reviewed and challenged plan, and record explicit user approval.
4. **Build:** edit the code and tests in small coherent steps.
5. **Verify:** inspect the exact diff and run the project's relevant checks.
6. **Repair:** after a verifier finding in a deep run, return to Approval,
   show the repair packet, and record approval for the bounded repair. Standard
   runs may enter Repair directly. Return to Plan when the approach changes,
   then verify again.
   Record a new Builder contribution for each repair before returning to Verify.
   Keep the second cycle focused on the repair: confirm named blockers are
   closed and check for regressions. Any newly discovered critical/high defect
   within the accepted scope still blocks completion, even if it predates the
   repair. At the two-cycle limit, report the blocker and stop.
7. **Finish:** leave the repository in a coherent state and give one concise
   delivery report.

Update the recovery record at meaningful boundaries:

```bash
node "$AE/scripts/forge.mjs" phase --id <id> --to <understand|plan|approval|build|verify|repair|blocked> --summary "<current truth>"
```

## Quality rules

- Respect repository instructions and existing user changes.
- Base claims on inspected code or executed checks. Keep unknowns visible.
- Prefer no change, reuse, or deletion before adding code, dependencies, files,
  or abstractions.
- Builder cannot be the only reviewer of its own work.
- Verification covers the requested behavior, the changed boundaries, and the
  actual diff—not a summary of it.
- Once Verifier records a candidate, a later file change requires another
  verification pass. Finish compares the current candidate with what Verifier
  inspected.
- Run narrow checks during implementation. Verifier independently re-runs the
  repository's required gates before completion.
- User-interface work requires inspecting the rendered result when the host can
  do so. State the limitation when it cannot.
- Critical or high findings block completion. Medium and low findings may be
  reported as residual risk when repair would exceed the request.
- Stop after two unsuccessful repair cycles and explain the blocker.
- A role may return DISPUTED **once**, with `VERIFIED (path:line)`
  counter-evidence, instead of complying with a finding it can show is wrong.
  Forge adjudicates: if the counter-evidence resolves and the finding's does
  not, drop the finding and record why. Never resolve a dispute by asking the
  reviewer to look again — that is how a bounded loop becomes an open one.

## What "done" means for this kind

`references/team.json` defines acceptance per kind. For a bug, re-run the
original reproduction and sweep sibling callers. A refactor preserves behavior
and passes existing tests unmodified; justify any genuine test-defect edit with
`--tests-changed-justified` on both `audit` and `finish`. A performance change
needs a comparable before/after measurement.

`finish` checks risk assessment, lens routing, current diff audit, and written
artifact sections. Perform missing work. Use `--accept-gaps` only for a truly
inapplicable check; the report names every accepted gap. Critical and high
findings still block completion.

Finish delivery only after implementation and verification. Read-only records
require Verifier and no code change; without Git, name the baseline gap:
Use `--accept-gaps baseline` only after disclosing that limitation.

```bash
node "$AE/scripts/forge.mjs" finish --id <id> --summary "<delivered outcome>" \
  --verification "<checks and verifier verdict>" --result "<PASS|PASS WITH RESIDUAL RISK>"
```

## Keep the user informed

Share concise progress at meaningful milestones and explain blockers promptly.
Keep expert transcripts and ledger details in the run files. Present the
approval packet only when a deep run needs a decision.

## Leave the project smarter than you found it

For a material accepted design decision, append a short entry below the managed
block in `.dev/knowledge/decisions.md`: decision, evidence, and rejected
alternative. Skip routine choices and preserve existing entries.

## Final response

Before the Verifier issues its verdict, run the deterministic checks and hand
them over as input:

```bash
node "$AE/scripts/forge.mjs" audit --id <id>
```

It settles scope, credential patterns, migration presence, test movement,
acceptance evidence and brief drift by exit code. It is not a verdict — the
Verifier still owns whether the tests are meaningful, whether scope crept, and
whether residual risk is acceptable.

For a mechanical false positive, record the Verifier's explicit remaining
severity after the current audit and pass `finish --audit-justification
"<counter-evidence>"`. The rationale appears in the report; unresolved role
findings cannot be waived this way.

Render the report from the ledger rather than recalling the run:

```bash
node "$AE/scripts/forge.mjs" report --id <id>
```

Add at most two sentences of plain-language outcome above it, then stop. The
report is generated from what was actually recorded — routing, each expert's
contribution, what each one caught, what was skipped and why, checks, and
repair cycles — so it cannot drift from the run the way a recalled summary
can. Do not paste role transcripts, state-machine terminology, token
accounting, or coordination files alongside it.

## Hard stops

- Do not claim completion when implementation or verification did not happen.
- Do not deploy, publish, spend money, access new private systems, or perform a
  destructive action without the authority required by the user and project.
- Do not expand a bounded request into unrelated cleanup.
- Do not turn missing metadata into a refusal to help after the first survey.
  Stale knowledge, an absent lens, and an unresolved judgment in `decisions.md`
  are reported while work proceeds. A new run requires first-run survey
  knowledge. `scripts/` is also required because it gates the run.
- Do not run an expert pass, print a routing block, or write a delivery report
  while the skill directory is unresolved. A Forge-shaped answer produced
  without Forge's gates is the failure this kit exists to prevent.
