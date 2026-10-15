# Recording and gates

Internal commands, not a user-operated interface. Resolve the installed Forge
directory as described in SKILL.md; below, `AE` means that absolute directory.
Use Node and the host's shell syntax. All commands accept `--root <project>`.

## Start and inspect

```bash
node "$AE/scripts/forge.mjs" list
node "$AE/scripts/forge.mjs" start --title "<full outcome>" --kind feature --risk none
node "$AE/scripts/forge.mjs" status --id <id>
node "$AE/scripts/forge.mjs" brief --id <id>
node "$AE/scripts/lens-select.mjs" --id <id>
node "$AE/scripts/forge.mjs" lenses --id <id> --json '<selector output>'
```

The risk flags are `access,stored-shape,rendered,runtime,irreversible`; record
every applicable behavioral boundary, or `none` after assessment.
`--domain` supplies a platform/standard source cannot reveal. `--signals`
only adds expertise. For a demonstrated defect cause, use
`--cause known --cause-evidence "<reproduction or inspected evidence>"`.
`--depth deep` adds design challenge; high-risk boundaries require it.
An unresolved cause alone selects Investigator.

Delivery pauses for approach review by default. Explicit user authorization
to skip that checkpoint is recorded with `--autonomous "<actual instruction>"`.
An unresolved material decision still uses
`--approval-required --approval-reason "<decision>"`; autonomy cannot
override that gate. Read-only kinds are `audit,plan,diagnose,review`.

Matching requests resume. Scope changes require a distinct run or a recorded
plan revision, not resetting state. Read the ledger, brief and relevant
original results on resume; refresh analysis after source change.

## Assign, record once, hand back

```bash
node "$AE/scripts/forge.mjs" phase --id <id> --to plan --summary "<current truth>"
node "$AE/scripts/forge.mjs" focus --id <id> --role architect --summary "<assignment>"
node "$AE/scripts/forge.mjs" note --id <id> --role architect --summary "<result>" --result .dev/work/<id>/results/architect.md --severity none
```

Workers write the shared result form before `note`; a later pass uses a new
filename. New runs update accepted evidence pointers and regenerate the ticket
in that single recording operation. They do not copy the report into a second
document. The legacy `section` command remains for old runs and explicit
coordinator decisions; it is unnecessary after a current worker contribution.

Contract v13 requires the shared six-section form and explicit `--severity`
for every role. Keep each file within this run's `results/` directory. The
recorded severity covers its highest finding, including existing audit hazards.
Explicit local citations use backticks or Markdown links and resolve from the
project root; missing or escaping references are rejected. Existence checks
never prove a claim true. Unavailable evidence is `UNAVAILABLE: <reason>`.

For an audit, fill the brief before `focus --role auditor` or recording its
result. Preserve the supplied request, confirmed answers, assumptions, scope
and exclusions, and Assessment checks. Delivery uses Acceptance criteria.
Every required section must be filled; honest unknowns remain explicit.
Accepted Auditor and read-only Verifier results preserve and bind the current
brief. A changed scope requires fresh assessment/review, not a retrospective
edit to the completed brief.

Review contributions add `--review-context isolated|same-session`.
Plan Reviewer/Challenger contribute in Plan; Builder in Build/Repair;
Verifier in Verify. Record constraints before plan review and candidate
domain reviews before Verifier. Repeat reviews only after new evidence or a
changed plan/candidate.

## User approach checkpoint

Fill the brief's confirmed behavior and acceptance criteria, and record the
implementation plan in Architect's result before review. No TODO placeholders
can enter Build.

```bash
node "$AE/scripts/forge.mjs" phase --id <id> --to approval --summary "Approach ready for user review"
node "$AE/scripts/forge.mjs" approval-packet --id <id>
node "$AE/scripts/forge.mjs" approve --id <id> --by "<person>" --basis "<actual approval and scope>"
node "$AE/scripts/forge.mjs" phase --id <id> --to build --summary "Implementing the approved approach"
```

Present the concise recommendation and alternatives on the ticket, with links
to the complete reviewed plan. A reviewer verdict does not authorize code.
Earlier user approval can supply the basis when it covers this exact approach.
The recorded approval binds plan and brief identity and preserves accepted
brief text. A material revision returns to Plan and fresh review.

## Ticket progress

Write a small JSON update inside the run's scratch directory, then call:

```bash
node "$AE/scripts/forge.mjs" update --id <id> --from .dev/work/<id>/scratch/ticket.json
```

Supported fields, supplied only when changing them:

```json
{
  "progress": "First slice checked; two remain. Final verification pending.",
  "next_action": "Builder: implement the next ready slice.",
  "blockers": [],
  "waiting_for": null,
  "tasks": [
    {"id":"create","title":"Create and persist a task","status":"done","owner":"builder","evidence":".dev/work/<id>/results/builder-1.md"},
    {"id":"complete","title":"Complete and reopen a task","status":"pending","owner":"builder"}
  ]
}
```

Task states: `pending,in-progress,done,blocked`. A completed task cites a
recorded contribution. Keep the authoritative checklist in the ledger;
the plan explains the design and dependencies without duplicating its status.
`waiting_for` is `user`, `external` or null. Blocker text names the needed
decision/dependency and who can resolve it. Phase changes reset the next action;
set a specific next action at the new handoff. Use measured progress, not
invented percentages. Refresh on meaningful changes, not polling heartbeats.
At least one meaningful, evidenced work item is required for v13 completion.
Do not add ceremonial items merely to increase the checklist count.

## Verify, repair, complete

After Builder records the integrated candidate, enter Verify. Execute
`forge.mjs audit --id <id>` for delivery; Verifier reviews the exact current
candidate, relevant tests and rendered evidence, then records its result.
Changes after entering Verify invalidate that candidate review.

For v13, Verifier records Claim re-verification, Scope conformance and Residual
risk. Audits use Finding → reverified evidence and an area/state coverage table;
deliveries use Acceptance → evidence. Each critical/high upstream finding is
rechecked as `<role>/<ID>`, with confirmed/corrected/unverified disposition.
Rendered evidence identifies screen/state, device/app/build, artifact and
observation method. Record only observed states; unreachable coverage stays
explicit. Unavailable material evidence cannot receive unqualified PASS.

A current verifier finding permits at most two in-scope Repair cycles, each
with a new Builder result and verification. Contract v12 reuses approval for
bounded repairs within that approach. Material design/scope changes return
to Plan and user review. Older contracts retain their recorded repair rules.

Resolve blockers and evidence every work item, then:

```bash
node "$AE/scripts/forge.mjs" finish --id <id> --summary "<outcome>" --verification "<checks and limits>" --result PASS
node "$AE/scripts/forge.mjs" report --id <id>
```

Missing baseline/lens/risk/audit evidence requires explicit named gaps and a
qualified verdict; v13 includes unassessed or unavailable domain coverage in
the lens gap. Verifier must record the same limits before `finish` can accept
PASS WITH RESIDUAL RISK. `help` lists the supported options. Unresolved critical/high
delivery findings block completion. The same generated ticket moves from
`.dev/runs/` to `.dev/completed/`; immutable evidence stays local.
