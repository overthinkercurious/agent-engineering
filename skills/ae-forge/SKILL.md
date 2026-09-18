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
AE="${CLAUDE_SKILL_DIR:-}"
[ -n "$AE" ] || for d in .claude/skills/ae-forge .agents/skills/ae-forge; do
  [ -f "$d/SKILL.md" ] && AE="$d" && break
done
```

Inspect the project instructions and current work. If `.dev/knowledge/` exists,
use it as a repository map; its absence is not a blocker. Inspect the repository
directly when knowledge is missing or stale.

First list current runs. Resume only a clearly matching active run; otherwise
create one small record. Skip the record for explanation-only work.

```bash
node "$AE/scripts/forge.mjs" list
node "$AE/scripts/forge.mjs" start --title "<request>" --kind <kind> --signals <comma-list>
```

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

An audit-only request is different: select Verifier and only the relevant
Architect, Security, Data, Experience, or Reliability expert. Do not add
Builder or edit code unless the user also asked for fixes. A release-readiness
review ("Release Auditor") is this same audit path with `kind: audit` — there
is no separate release role; scope it to the relevant specialists (Reliability
for rollout/observability, Security for exposure, Data for migration safety)
plus Verifier.

Dispatch experts using this host's isolated-agent capability, using the same
tier vocabulary as `ae-surveyor`'s `references/targets.yml` (kept in sync with
it rather than duplicated file-for-file, since installed skills cannot read
each other's files): `native-parallel` (concurrent isolated dispatch),
`native-sequential` (isolation confirmed, not concurrency), or `none` (the
default — assume this unless this host is independently known to support
isolated dispatch). On `native-parallel` or `native-sequential`, give each
expert the request, exact repository scope, relevant project rules, its
dedicated workflow file, and the shared result contract; experts return
findings to Forge and never dispatch one another. On `none`, run explicit
role passes in this same session and disclose in the final report that
verification was not context-independent this run.

Forge is the sole coordinator. Planning and review roles are read-only. Builder
is the only role that edits application code. Do not run Builder and Verifier
concurrently, and do not let experts mutate the recovery record.

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

For material approval, summarize the outcome, important tradeoffs, and risk in
plain language. After the user approves, record it with `approve`. Do not ask
for approval merely because a workflow stage exists.

Use these phases internally, omitting Plan only for quick work with no open
design choice:

1. **Understand:** inspect instructions, reproduce bugs, and identify unknowns.
2. **Plan:** state acceptance behavior and the smallest implementation path.
3. **Build:** edit the code and tests in small coherent steps.
4. **Verify:** inspect the exact diff and run the project's relevant checks.
5. **Repair:** fix valid findings and verify again, for at most two cycles.
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

Finish a delivery record only after implementation and verification both
contributed. An audit-only record requires the Verifier and no code change:

```bash
node "$AE/scripts/forge.mjs" finish --id <id> --summary "<delivered outcome>" --verification "<checks and independent verdict>"
```

## Final response

Lead with the delivered outcome. Include the important files or behavior,
checks performed, and any residual risk or user action. Do not expose internal
role transcripts, state-machine terminology, token accounting, or generated
coordination files unless the user asks.

## Hard stops

- Do not claim completion when implementation or verification did not happen.
- Do not deploy, publish, spend money, access new private systems, or perform a
  destructive action without the authority required by the user and project.
- Do not expand a bounded request into unrelated cleanup.
- Do not turn missing optional Agent Engineering metadata into a refusal to
  help.
