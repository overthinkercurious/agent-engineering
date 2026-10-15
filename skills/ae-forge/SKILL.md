---
name: ae-forge
description: >
  Deliver a software change, diagnose a problem, audit an application, or
  review existing work. Forge clarifies requirements, researches uncertainty,
  presents an approach for user review, implements small slices and verifies
  the result. The single entry point for Agent Engineering.
metadata:
  owns: "delivering a software outcome through an autonomous specialist team"
---

# Forge

Own the request through its requested outcome. Use the host coding agent,
its tools and native delegation; keep workflow mechanics internal.

## 1. Start or resume

Resolve the installed `ae-forge` directory before running a script: prefer
`AE_SKILL_DIR`, then `CLAUDE_SKILL_DIR`, then the project's `.agents/skills`,
`.claude/skills`, `.gemini/skills` or `.agent/skills`. An environment path
may identify a stage sibling; resolve `ae-forge` alongside it. Use absolute
script paths. If the contract or a bundled script is missing, report the
unresolved installation and stop rather than improvising a Forge run.

Read [team.md](references/team.md) for the shared result and handoff contract.
Use [commands.md](references/commands.md) when starting, recording work or
advancing a phase. Explanation-only requests need no run.

Inspect project instructions and current changes. Classify the outcome:
delivery changes code; audit, plan, diagnose and review are read-only.
Assess behavioral risk with the questions in `team.json`; signals only add
coverage. Start or resume the matching request, inspect its state and original
evidence, and refresh deterministic analysis when source has changed.
Unavailable analysis reduces domain detection; continue source inspection
and report the limitation.

Print the recorded routing, approval requirement and enforcement tier.
Roles name accountable methods, not mandatory separate agents. Forge can
perform discovery and planning in its own context. Give another worker a
bounded assignment only when separate investigation, implementation or
independent review earns the handoff. Keep dependent work sequential.

## 2. Discover and research

Follow [discovery.md](references/discovery.md). Inspect before asking; resolve
unanswered behavior, scope and constraint questions in focused rounds.
Record confirmed answers separately from assumptions. Research remaining
uncertainty against relevant primary sources and test material documentation
claims against current source and the identified running build.

Keep the ticket current: owner, now, concrete progress, blockers and next
action. Hold dependent work on unresolved requirements; continue independent
inspection. The analyzer is a reading aid, not a limit on necessary evidence.

Load only selected methods from `team.json` and lenses printed by
`lens-select.mjs`. For an unexplained defect, use `ae-investigate` before
planning; an unknown cause requires diagnosis, not automatically Challenger.

## 3. Choose the outcome path

**Delivery:** use `ae-plan` to define behavior, the simplest adequate approach,
genuine alternatives, affected boundaries and small verifiable vertical slices.
Apply selected domain methods as constraints; review the current plan using
`ae-plan-review`. Deep design risk adds Challenger. These are checks of the
approach, not permission from the user.

The default is **Approach review**. Present the recommendation, why it fits
confirmed requirements, alternatives and why they were not selected, risks,
planned slices and how success will be checked. Show the ticket and decision
packet, then wait for the user's decision before application edits.
An earlier approval of this same current approach can be recorded as its basis.
Use `--autonomous "<actual user authorization>"` only when the user explicitly
authorized proceeding without this checkpoint. It grants no unrelated authority.
Material revisions repeat affected reviews and the user checkpoint.

After approval, use `ae-build`: one complete behavior, its checks, then the
next ready slice. Each slice includes only the layers it actually needs.
For substantial UI uncertainty, show a representative design before build;
validate the rendered working slice early. Update the same ticket checklist.

**Audit:** select relevant domain methods, then `ae-audit` and `ae-verify`.
For a rendered audit, discover tool capabilities, the design baseline and
screen/state coverage before inspection. Fill the assessment brief before
assigning Auditor; record scope, exclusions and observable assessment checks.
A deep audit increases evidence and
coverage; it does not authorize fixes or require a delivery plan.

**Plan, diagnose or review:** use the corresponding selected method and
Verifier to deliver the assessment. These paths cannot enter Build or Repair.

## 4. Verify and complete

Enter Verify after the integrated candidate exists. Selected technical domain
methods inspect their boundaries, then `ae-verify` judges the exact candidate
and executed evidence. Prefer an independent host context when available and
authorized; otherwise reopen evidence sequentially and label same-session
review honestly. Changes invalidate the old candidate review.

Repair current findings within the approved approach, recheck, then reverify.
Repair is capped at two cycles. Material scope or design changes return to
Plan and approach review. Respect authority boundaries even in autonomous mode.

Finish only when the requested outcome is evidenced, the brief is filled, at
least one meaningful checklist item has recorded evidence, ticket blockers and
work items are resolved, and delivery has no critical/high findings. A supported
audit can finish while reporting serious existing defects. Render the final
report from the ledger and move the same ticket to `.dev/completed/`.
Preserve user changes and raw evidence; clean only disposable run scratch.

## Recovery and limits

The human ticket is generated Markdown, not a gate input or worker transcript.
Workers write one new immutable result per meaningful pass; recording it
refreshes the ticket. Hand off source and evidence pointers, not the ticket alone.
Current runs use contract v13: every expert result uses the shared form,
Verifier records reopened claims and coverage, and evidence gaps require a
qualified verdict. Local citation checks establish existence, not truth.
Older runs, including v12, keep their stored contract and
artifact layout; do not rewrite them to bypass a gate. Explicitly cancel and
start a current run when changing their workflow.

Hooks are optional edit checks, not a sandbox. Report `none` unless a current
host hook was actually observed; editable hook configuration and subagent or
shell writes limit enforcement. Keep every generated artifact inside the
target project and local under its ignored `.dev/` directory.
