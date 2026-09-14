---
name: ae-forge
description: >
  Turns a product idea or software change into a researched, planned,
  implemented, independently audited, and verified result using the project's
  Agent Engineering knowledge and a routed team of specialists. Use when the
  user wants to brainstorm or validate an idea, build or change a feature, fix
  a bug, improve performance, review security, resume an Agent Engineering run,
  or ship a production-ready pull request. Do not use to index a project; that
  belongs to ae-init.
metadata:
  owns: "delivering a product or engineering outcome through specialist orchestration"
---

# Forge an outcome

Own the run from intent to independently verified delivery. Coordinate the
work; do not impersonate every specialist in one context.

## Locate this skill

Every bundled command needs this skill directory. Claude Code may set
`CLAUDE_SKILL_DIR`; other tools do not. Resolve it once and reuse `AE`:

```bash
AE="${CLAUDE_SKILL_DIR:-}"
[ -n "$AE" ] || for d in .claude/skills/ae-forge .agents/skills/ae-forge; do
  [ -f "$d/SKILL.md" ] && AE="$d" && break
done
[ -n "$AE" ] || { echo "cannot find ae-forge" >&2; exit 2; }
```

## Start or resume

Read `references/contract.md` first. It defines evidence, ownership, authority,
and completion for every mode.

Check current work:

```bash
node "$AE/scripts/forge.mjs" list
```

If the user is clearly continuing an existing feature, validate and resume its
workspace. Otherwise start one:

```bash
node "$AE/scripts/forge.mjs" start --title "<request title>" --kind <kind> --signals <comma-list>
```

Kinds are `idea`, `feature`, `bug`, `refactor`, `performance`, `security`, and
`audit`. Signals describe behavior or risk, not filenames. The command returns
a feature id and deterministic routing suggestion. If project initialization
is missing, return its structured prerequisite result and stop there.

## Route the workflow

Read `references/registry.json`. Load only the stage, specialist, and lens files
selected for this run. The registry is the routing authority; descriptions in
prose do not override it.

A specialist may request another specialty through a structured result. It may
not invoke another specialist itself. Validate the request, record the reason,
check the budget, and dispatch through the host's isolated-agent mechanism.

Forge records a deterministic risk assessment at intake. `light`, `standard`,
and `deep` are selected from the project-policy floor plus explicit behavior,
blast radius, reversibility, sensitivity, uncertainty, and cross-system inputs.
Risk can only stay level or rise. A filename match is recorded as a lead, never
as proof. After implementation begins, run `forge.mjs reclassify --id <id>` so
the completed diff and candidate identity can add required coverage.

## Dispatch through the runner

Never invoke a specialist host directly. Use `forge.mjs dispatch` with a local,
schema-valid host adapter, one stage, one registered specialist, explicit
acceptance IDs, exact file inputs, allowed tools and writes, invariants, a
concrete procedure, a next check, and reserved usage. Read the current stage
reference for the fields to select. Set `--independent` for independent work;
shared host context is then rejected. For a validated `needs_specialist`
follow-up, pass `--parent-dispatch <id>` so Forge can enforce routing ancestry
and cycle limits.

For a bug or performance request, dispatch Probe with `--stage diagnosis` from
a fresh independent context before advancing to definition. A complete result
must contain the structured causal account defined in the result schema. If no
cause is supported, preserve uncertainty and halt. Diagnosis and later
verification use different dispatch IDs and results.

The runner binds the packet, brief, shared contract, specialist workflow,
policy, candidate, host runtime, and selected inputs into a dependency key. It validates and secret-scans the
result before accepting it, reconciles actual usage, and persists an auditable
record under the feature workspace. A repeated dispatch ID succeeds only when
all bound evidence is unchanged.

A repairable output or contract failure may be retried once with a new dispatch
ID and `--retry-of <failed-id>`. Transport, permission, secret, and budget
failures are not locally retried. A strongest-class host under a mixed profile
requires `--model-escalation-reason`; smaller-only profiles always reject it.
Every call still records the actual host model and reconciles its usage. Forge
stops an equivalent dispatch when complete evidence already exists for the
same candidate and bounded task.

For a local Codex host, `scripts/codex-host.mjs` provides a fresh ephemeral,
schema-constrained read-only adapter. Configure its model and model class in a
project-local host configuration. It accepts only `read` with no write roots,
verifies and embeds only routed UTF-8 text, disables the model's shell plus
auxiliary agents and interactive/network-capable UI tools, supplies usage from
host telemetry, pins non-interactive approvals inside the read-only sandbox,
and fails closed for broader packets. Do not label
its unavailable monetary charge or cancellation acknowledgement as measured.

After interruption or before relying on local evidence, run:

```bash
node "$AE/scripts/forge.mjs" doctor --id <feature-id>
```

Treat doctor failures as stale or inconsistent evidence. Its durability report
also states which host memory and unavailable telemetry are not evidence.

Use fresh contexts for independent product challenge, plan review, domain
audit, and release audit. Give each agent the approved intent, its routed
context packet, its workflow file, and the exact output path. Do not give it the
persuasive reasoning of the artifact author unless that reasoning is evidence
the reviewer must examine.

## Runner-owned verification

No one — including Judge — may hand-write a command receipt. During `audit`,
`verification`, or `repair`, run the project's declared quality command through
the runner itself so Forge measures the exit code and output digest directly:

```bash
node "$AE/scripts/forge.mjs" verify --id <feature-id> --receipt-id <id> --command "<one of the effective policy's required_commands, verbatim>"
```

The resulting receipt is bound to the exact current candidate. A specialist
result may cite it as `MEASURED` evidence only by its exact receipt ID; a
citation that does not resolve to a real, runner-issued receipt on the current
candidate is rejected before the result is accepted. Dispatch Judge in
`verification` with `--independent` after verification succeeds; its result
must cite the receipt and its packet's acceptance IDs must cover every
acceptance ID implemented so far. `ready_for_pr` fails closed without that
independent Judge dispatch, without acceptance coverage, and without every open
finding recorded in `reviews/release-audit.md`.

## Run stages

Execute the stages selected by the request in dependency order:

1. Intake — `references/stages/intake.md`
2. Discovery, when intent is not already bounded — `references/stages/discover.md`
3. Definition — `references/stages/define.md`
4. Planning and independent plan review — `references/stages/plan.md`
5. Approval — `references/stages/approve.md`
6. Implementation and integration — `references/stages/build.md`
7. Domain audits, repair, and verification — `references/stages/audit.md`
8. Delivery and durable knowledge promotion — `references/stages/finish.md`

Advance state only through the runner:

```bash
node "$AE/scripts/forge.mjs" advance --id <feature-id> --to <state>
```

The runner checks required artifacts and legal transitions. When an executable
check exists, use its result rather than a model claim.

## Approval and authority

Present one material approval package after the plan passes independent review.
Before treating it as approved, record it:

```bash
node "$AE/scripts/forge.mjs" approve --id <feature-id>
```

Approval binds the intent, definition, plan, and plan review to their content
digests and current base revision. Verify the binding before implementation and
after any interruption:

```bash
node "$AE/scripts/forge.mjs" check --id <feature-id>
```

After approval, decide routine reversible engineering questions within project
policy and record material rulings in `decisions.md`. Escalate only the
conditions named in the contract or project authority policy.

## Completion

Completion requires the exact candidate revision, required command receipts,
acceptance evidence, disposition of specialist findings, a release audit, and a
working preview when user-facing behavior changed. The MVP target is a reviewed
pull request; deployment needs a separate project release policy and authority.

Close with the delivered behavior, evidence, residual risks, cost by stage, and
the exact external action remaining, if any.

## Hard boundaries

- Never implement before the material approval unless the user explicitly
  authorized implementation in the current conversation.
- Never let a specialist change another specialist's authoritative artifact.
- Never describe a heuristic, citation, exit code, or model review as proving
  more than it checked.
- Never expose secrets in the feature workspace or reports.
- Never allow implementation to weaken its own acceptance gates without an
  independent finding and recorded authority.
- Never declare integrated success from independently passing task reports.
