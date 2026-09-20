---
name: ae-forge
description: >
  Takes a software request from problem to implemented and independently
  verified result using a small, risk-sized team. Use for features, bugs,
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
at most two domain lenses per selected role from `references/lenses/`.
Lenses add platform/protocol depth; they never replace a role's own file.
Load only the lenses actually attached — `references/lenses/_index.md` lists
what exists versus what's still backlog.

## Operating promise

1. Understand the request and the repository.
2. Select the smallest team that covers the risk.
3. Plan only as much as safe implementation requires.
4. Implement requested changes; planning alone is not delivery.
5. Have a verifier independently inspect the result and run relevant checks.
6. Repair valid findings, then report what changed and what remains uncertain.

Keep coordination internal. Give the user short progress updates and ask only
when a decision would materially change the outcome or requires new authority.

## Start or resume

Resolve the installed skill directory once:

```bash
AE="${AE_SKILL_DIR:-${CLAUDE_SKILL_DIR:-}}"
[ -n "$AE" ] || for d in .claude/skills/ae-forge .agents/skills/ae-forge; do
  [ -f "$d/SKILL.md" ] && AE="$d" && break
done
```

Inspect the project instructions and current work. Build the repository map
**once per run**, before any expert starts, and give every expert the same map:

```bash
# ae-surveyor installs as a sibling of this skill; use its analyzer when present.
SV="$(dirname "$AE")/ae-surveyor"
if [ -f "$SV/scripts/analyze.mjs" ] && [ ! -s .dev/context/analysis.json ]; then
  node "$SV/scripts/analyze.mjs" --budget-tokens 60000
fi
```

If `.dev/knowledge/` exists, read `00-index.md` first and follow it to the one
or two documents that answer the current question. Otherwise use
`.dev/context/analysis.json`'s ranked file list as the reading plan. Neither is
a blocker: when no map can be produced, inspect the repository directly and say
so in the report.

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
  --risk <comma-list|none> [--domain <comma-list>]
```

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

Domain depth adapts to the project on its own: `lens-select.mjs` reads the
survey's sensor dump and derives domain tags from what the repository actually
contains, so a Stripe dependency reaches the payments lens and an OpenAI
dependency reaches the AI/LLM lens without anyone naming them. Pass `--domain`
only for what the project cannot reveal — a target platform, a standard the
team has adopted but not yet imported. A miss there costs depth, never a
review.

Use `status --id <id>` to resume. Never make the user manage this record. It
is an internal recovery aid, not an approval bureaucracy.

Kinds are `idea`, `feature`, `bug`, `refactor`, `performance`, `security`, and
`audit`.

## Size the team

Classify by behavior and risk, not filenames:

- **Quick:** local, reversible, understood, and low-risk. Builder + Verifier.
- **Standard:** several files or a meaningful design choice. Architect +
  Builder + Verifier. Add Investigator for an unknown defect.
- **Deep:** trust boundaries, payments, permissions, destructive data changes,
  public contracts, or difficult rollback. Architect + Builder + Verifier plus
  only the relevant Security, Data, Reliability, Experience, Product, or
  Investigator expert.

Three roles are the normal team. Five is the maximum without telling the user
why multiple independent risk boundaries require more. Do not run every expert,
every checklist, or a separate critic merely because they exist.

### Print the routing decision

Before any expert works, print the routing block from `start`'s output — six
lines, once, then stay quiet:

```text
Routing · deep · Architect → Security → Experience → Builder → Verifier
Why     · risk=access (changes who may authenticate), risk=rendered (new login journey)
Skipped · data (no stored-shape risk declared) · reliability (no runtime risk declared)
        · investigator (no undiagnosed defect) · product (outcome already specified)
Lenses  · ui-finish → experience, builder
Approval· required before build (external provider registration)
```

The `Skipped` line is required. A review the team decided not to run is the
one thing the user cannot infer from the result, and it is how a wrong routing
decision gets caught on the first run instead of the tenth.

An audit-only request is different: select Verifier and only the relevant
Architect, Security, Data, Experience, or Reliability expert. Do not add
Builder or edit code unless the user also asked for fixes. A release-readiness
review ("Release Auditor") is this same audit path with `kind: audit` — there
is no separate release role; scope it to the relevant specialists (Reliability
for rollout/observability, Security for exposure, Data for migration safety)
plus Verifier.

Resolve this host's isolated-agent capability before dispatching anything:

```bash
cat .dev/context/host.json   # written by ae-surveyor stage 1
```

Find **your own** row in `hosts` — you know which tool you are running as —
and use its `dispatch` value. Do not infer a tier from `detected_in_project`;
that field describes what this repository contains, not what is executing.
If the file is absent, or you cannot identify your own row, use
`default_dispatch` and say so in the report.

The tiers: `native-parallel` (concurrent isolated dispatch),
`native-sequential` (isolation confirmed, not concurrency), `none`.

On `native-parallel` or `native-sequential`, give each expert the request,
exact repository scope, relevant project rules, its dedicated workflow file,
and the shared result contract; experts return findings to Forge and never
dispatch one another. A dispatched expert inherits nothing from this
conversation, so everything it needs must be in its prompt — that isolation
is the point, not an inconvenience to work around by summarising what you
already concluded.

On `none`, run explicit role passes in this same session and disclose in the
final report that verification was not context-independent this run.

Forge is the sole coordinator. Planning and review roles are read-only. Builder
is the only role that edits application code. Do not run Builder and Verifier
concurrently, and do not let experts mutate the recovery record.

Record what the lenses decided, so lens routing is as measurable as role
routing — the report renders from this:

```bash
node "$AE/scripts/forge.mjs" lenses --id <id>   --json "$(node "$AE/scripts/lens-select.mjs" --team <roles> [--domain <words>])"
```

Record material contributions with:

```bash
node "$AE/scripts/forge.mjs" note --id <id> --role <role> --summary "<result>"
```

## Work autonomously

Proceed without approval for routine, reversible work that clearly matches the
request. Ask once before implementation only when the plan introduces a
material product choice, irreversible or destructive action, external side
effect, new spending/access, production deployment, or unresolved high-risk
tradeoff.

Four actions are gated at the moment of action, every run, no matter what was
approved earlier: **pushing to a remote, merging, migrating a shared
environment, and anything that spends money.** Approval of a brief authorises
the change, never its release. These leave the machine or touch state other
people depend on, so a plan-time "yes" cannot cover them — the person saying
yes has not seen the diff yet. Editing files, running checks, and committing
locally are not in this set and need no separate approval.

Approval is a document, not a paragraph. Scaffold the brief and fill it, then
point the user at it:

```bash
node "$AE/scripts/forge.mjs" brief --id <id>
```

The brief carries only the sections its tier calls for — a section outside the
tier is omitted, never filled with "N/A". A quick brief is four sections; a
four-page plan for a one-line fix is a defect, not thoroughness.

After the user approves, record it with `approve`. That freezes the brief: it
becomes the contract the release audit compares the delivered change against,
so do not rewrite it afterwards. Do not ask for approval merely because a
workflow stage exists.

Write each expert's full result to `.dev/work/<id>/results/<role>.md` and pass
the path to `note`. Downstream experts receive **paths and findings, never
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

Use these phases internally, omitting Plan only for quick work with no open
design choice:

1. **Understand:** inspect instructions, reproduce bugs, and identify unknowns.
2. **Plan:** state acceptance behavior and the smallest implementation path.
3. **Build:** edit the code and tests in small coherent steps.
4. **Verify:** inspect the exact diff and run the project's relevant checks.
5. **Repair:** fix valid findings and verify again, for at most two cycles.
   Keep the second cycle focused on the repair: confirm named blockers are
   closed and check for regressions. Any newly discovered critical/high defect
   within the accepted scope still blocks completion, even if it predates the
   repair. At the two-cycle limit, report the blocker and stop.
6. **Finish:** leave the repository in a coherent state and give one concise
   delivery report.

Update the recovery record at meaningful boundaries:

```bash
node "$AE/scripts/forge.mjs" phase --id <id> --to <understand|plan|build|verify|repair|blocked> --summary "<current truth>"
```

## Quality rules

- Respect repository instructions and existing user changes.
- Base claims on inspected code or executed checks. Keep unknowns visible.
- Prefer no change, reuse, or deletion before adding code, dependencies, files,
  or abstractions.
- Builder cannot be the only reviewer of its own work.
- Verification covers the requested behavior, the changed boundaries, and the
  actual diff—not a summary of it.
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

`references/team.json`'s `acceptance` block defines the bar per kind. Most of
it is judgment the Verifier owns, but two are not negotiable:

| Kind | Done means | Non-negotiable |
|---|---|---|
| `bug` | the original reproduction now passes | re-run the **original** repro, not a new test that happens to pass; sweep callers |
| `refactor` | **behaviour is unchanged** | existing tests pass **unmodified** — `finish` refuses otherwise |
| `performance` | measured improvement under identical conditions | a before **and** after measurement; a percentile, not a mean |

A refactor that rewrote its own tests has not demonstrated behaviour
preservation, whatever the suite reports. If a test edit genuinely fixes a
test defect rather than accommodating a behaviour change, say so in the report
and pass `--tests-changed-justified` to both `audit` and `finish`.

`finish` refuses to close a run whose required steps did not happen: an
unassessed risk set, an unrecorded lens selection, or a deterministic audit
that never ran or inspected an earlier revision. Do the step. When one is
genuinely not applicable, close with `--accept-gaps <names>` — each accepted
gap is named in the delivery report rather than disappearing.

Finish a delivery record only after implementation and verification both
contributed. An audit-only record requires the Verifier and no code change:

```bash
node "$AE/scripts/forge.mjs" finish --id <id> --summary "<delivered outcome>" --verification "<checks and independent verdict>"
```

## Stay quiet while working

The user reads the routing block, then the result. Between them, keep output
to a hard minimum:

| Moment | Allowed | Cap |
|---|---|---|
| After routing | the routing block | 6 lines |
| Phase transition | `plan → build` plus a half-line of current truth | 1 line |
| An expert finishes | **nothing** — it goes to `results/<role>.md` | 0 lines |
| A blocking finding | severity and the affected behavior | 1 line |
| Approval needed | the brief's path and the decision being asked | the brief |
| Completion | the delivery report | ~20 lines |

A five-role deep run should produce about ten lines of chat before the final
report, however much work happened underneath. Never narrate file-by-file
progress, expert reasoning, ledger commands, or phase vocabulary.

## Leave the project smarter than you found it

When a run accepts a material design decision — one a future Architect would
otherwise rediscover — append one entry to `.dev/knowledge/decisions.md`,
below its managed block, before finishing:

```markdown
- **2026-09-20 · Session storage for OAuth.** Reused the existing session
  store rather than adding a token table.
  **Evidence:** VERIFIED `src/session/store.ts:41`
  **Rejected:** a dedicated token table — a second source of session truth.
```

That file is already committed and already names Architect as its reader. One
line per genuine decision is the difference between a workflow and an
organization: without it every run re-derives what the last run already
settled. Do not log routine choices, and never rewrite an existing entry.

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
- Do not turn missing optional Agent Engineering metadata into a refusal to
  help.
