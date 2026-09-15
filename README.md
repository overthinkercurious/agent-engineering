# Agent Engineering

A project-scoped product and engineering team for AI coding tools. It turns a
rough idea, feature, defect, or technical change into an approved plan and a
verified implementation while keeping the project's context between sessions.

The kit exposes two public skills:

- **`ae-init`** indexes the repository and creates its durable knowledge,
  enforceable rules, and operating policy.
- **`ae-forge`** receives every product and engineering request, selects the
  smallest qualified specialist team, and governs the work through approval,
  implementation, independent audit, and verification.

Scout, Pulse, Rift, Flow, Spine, Pixel, Core, Shift, Vault, Signal, Probe, and
Judge are internal specialist workflows. Focused lenses such as Threat,
Tenancy, Integrity, Access, Speed, and Recover add review depth without loading
another broad persona. They have unique ownership and communicate through
artifacts rather than directly invoking one another.

## Requirements and supported scope

| Requirement | Why |
|---|---|
| A Git repository with a valid `HEAD` commit | Approval and evidence bind to a revision |
| Commands run from the Git project root | `--root` must name that root, not a subdirectory |
| Node.js on `PATH` | The runner is plain Node with no dependencies |
| `ae-init` completed in the project | Forge reads `.dev/knowledge/`, `.dev/rules/`, and `.dev/policy/` |
| A host adapter, to run model work | Specialists execute only through a configured adapter |

**Git-only.** A non-Git directory, or a repository with no valid `HEAD`, is
rejected outright with `unsupported_project_scope`; there is no degraded mode.
Running Forge before `ae-init` fails with `project_not_initialized` and the list
of missing policy files. Both are refusals, not warnings.

Windows, macOS, and Linux are all usable; on Git Bash for Windows set `TMPDIR`
to a native Windows path before running the shell test suites.

## Install

Install project-scoped skills into every compatible AI tool detected by the
[Skills CLI](https://github.com/vercel-labs/skills):

```bash
npx skills add overthinkercurious/agent-engineering --all --copy -y
```

`--copy` creates real directories. This avoids broken skill symlinks when a
project is cloned on Windows. The installed `ae-*` directories are treated as
dependencies and are added to `.gitignore`; `skills-lock.json` records the
version to restore.

This repository also carries native plugin manifests for Codex
(`.codex-plugin/plugin.json`) and Claude Code
(`.claude-plugin/plugin.json` plus a local marketplace). A local Codex
marketplace can point at this checkout and install
`agent-engineering@<marketplace-name>`. Claude Code can add this repository as
a marketplace and install `agent-engineering@agent-engineering`.

The portable path covers tools that implement Agent Skills and the instruction
files listed in `skills/ae-init/references/targets.yml`. No package format can
make a tool load skills when that tool exposes no skill or instruction
interface; adding a supported tool is a data change in `targets.yml`, not a
rewrite of the kit.

After installation, ask the agent:

> Initialize this project with ae-init.

Then use one entry point for later work:

> Use ae-forge to shape and build this feature: ...

### Google Antigravity IDE

Install only for Antigravity when you do not need the other agent targets:

```bash
npx skills add overthinkercurious/agent-engineering --skill '*' --agent antigravity --copy -y
```

This places `ae-init` and `ae-forge` under `.agents/skills/`, Antigravity's
current workspace skill directory. Running `ae-init` also creates
`.agents/rules/agent-engineering.md`, so the project's knowledge, rules, and
policy remain discoverable in ordinary Antigravity sessions. Both skills can be
started explicitly with `/ae-init` and `/ae-forge` or selected from their
descriptions.

## How it works

`ae-init` runs five ordered stages:

| Stage | Deterministic owner | Durable result |
|---|---|---|
| Scaffold | `scaffold.sh` | `.dev/`, tool pointers, scoped ignore rules |
| Analyze | `analyze.mjs` | `.dev/context/analysis.json` |
| Knowledge | `knowledge.mjs` plus bounded judgment | `.dev/knowledge/*.md` |
| Rules | `rules.mjs` plus bounded judgment | `.dev/rules/*.md` |
| Policy | `policy.mjs` plus bounded judgment | `.dev/policy/*.yml` |
| Verify | `doctor.sh` | Machine-checkable health verdict |

Scripts own facts and checks. The model fills explicitly marked judgment slots
from a budgeted reading set. Unknowns stay visible. The committed policy tells
Forge what it may decide, which commands prove quality, how risks affect
routing, and what evidence a release needs.

`ae-forge` then creates one ignored workspace per request:

```text
.dev/work/<feature-id>/
├── manifest.json          # request class, base commit, policy digest, selected team
├── state.json             # legal workflow state, budget, usage, pause point
├── intent.md              # authoritative outcome and constraints
├── decisions.md           # material rulings recorded after approval
├── context/               # risk assessment and resolved effective policy
├── discovery/             # specialist evidence and synthesis
├── design/                # approved product and technical definition
├── plan/                  # implementation and verification plan
├── implementation/        # integration record
├── reviews/               # plan, domain, and release audits
├── verification/          # acceptance evidence
├── evidence/receipts/     # runner-issued command receipts
├── runs/dispatches/<id>/  # packet, brief, result, and record per dispatch
├── runs/operations/       # budget reservation receipts
└── approval.json          # hashes of the approved artifacts
```

The state machine permits only:

```text
created → classified → discovery → definition → plan review
→ awaiting approval → approved → implementation → integration
→ audit → verification → ready for PR → complete

classified → definition          (discovery may be skipped when intent is bounded)
audit or verification → repair → implementation
```

`awaiting specialist`, `blocked`, and `halted` preserve a validated resume
point. `cancelled` and `complete` are terminal. Repair never jumps directly to
verification; it returns through implementation, integration, and fresh audit.
Every transition checks the artifacts that state requires before it is allowed.

The runner hashes intent, definition, implementation plan, and plan review when
the user approves them. Editing one later invalidates the approval. So does
moving the base commit out of the current history, or changing the effective
policy the approval was made under. Probe owns verification design on every
plan; Judge independently owns the final release verdict. Risk signals add
specialists and lenses, while ordinary changes avoid their cost.

## Artifact policy

| Committed project contract | Ignored local working memory |
|---|---|
| `.dev/knowledge/` | `.dev/context/` |
| `.dev/rules/` | `.dev/work/` |
| `.dev/policy/` | installed `**/skills/ae-*/` copies |
| instruction pointer blocks | |
| `skills-lock.json` | |

Knowledge is split by question so later sessions read only what they need.
Managed blocks can be regenerated while notes outside them survive. Feature
workspaces preserve the full reasoning trail locally without putting session
transcripts or sensitive evidence into git.

## Specialist roster

| Specialist | Exclusive ownership |
|---|---|
| Scout | Opportunity evidence and alternatives |
| Pulse | Product outcome, value, scope, and success |
| Rift | Adversarial challenge of the product recommendation |
| Flow | User journeys and experience acceptance |
| Spine | System boundaries, interfaces, and material decisions |
| Pixel | Client architecture and implemented experience |
| Core | Services, APIs, integrations, and server behavior |
| Shift | Schemas, migrations, backfills, and data recovery |
| Vault | Threats, authorization, privacy, and security verification |
| Signal | Failure behavior, performance, observability, and recovery |
| Probe | Independent acceptance and risk-based verification design |
| Judge | Integrated delivery-readiness judgment |

The registry in `skills/ae-forge/references/registry.json` is the routing source
of truth. Each specialist has one workflow file, one ownership statement, and
structured completion and escalation outputs.

## Runner

The deterministic Forge runner has no dependencies. Agents normally run these
commands through `ae-forge`; the CLI is documented so state, evidence, and
approval behavior stay inspectable and testable.

| Command | What it does |
|---|---|
| `start` | Creates the run workspace, resolves effective policy, classifies risk, selects the team, and records the base commit |
| `list` | Lists every run under `.dev/work/` with its title, kind, status, and last update |
| `status` | Prints one run's manifest, state, and current approval verdict |
| `route` | Adds signals and re-runs risk classification; refused once the run is approved |
| `reclassify` | Re-runs risk against the completed diff versus the base commit, after implementation has begun |
| `advance` | Moves to the next legal state after checking that state's required artifacts |
| `approve` | Records explicit user approval and hashes the four authoritative artifacts |
| `dispatch` | Runs one bounded specialist task through a host adapter |
| `verify` | Executes one declared quality command and issues a runner-owned receipt |
| `reserve` | Reserves run budget for a host operation performed outside `dispatch` |
| `reconcile` | Closes a reservation with actual usage and records its provenance |
| `pause` | Moves to `awaiting_specialist`, `blocked`, or `halted` with a reason code and resume action |
| `resume` | Returns to the recorded prior state after re-checking artifacts and approval |
| `cancel` | Ends the run; cancellation is terminal |
| `check` | Verifies ids, registry membership, risk consistency, policy freshness, approval binding, and candidate staleness |
| `doctor` | Everything `check` does, plus per-dispatch evidence integrity, secret scanning, pending-reservation warnings, and a durability statement |

A typical run:

```bash
node skills/ae-forge/scripts/forge.mjs start --title "Team invitations" --kind feature --signals ui,auth
node skills/ae-forge/scripts/forge.mjs list
node skills/ae-forge/scripts/forge.mjs status --id team-invitations
node skills/ae-forge/scripts/forge.mjs route --id team-invitations --signals tenant
node skills/ae-forge/scripts/forge.mjs advance --id team-invitations --to classified
node skills/ae-forge/scripts/forge.mjs approve --id team-invitations
node skills/ae-forge/scripts/forge.mjs check --id team-invitations
```

Kinds are `idea`, `feature`, `bug`, `refactor`, `performance`, `security`, and
`audit`. `approve` refuses a run whose intent, definition, plan, or plan review
is missing or still contains `TODO`. `advance --to repair` requires canonical
finding ids (`--findings finding:<16 hex>`), so repair cannot start without a
recorded reason.

Every command prints JSON on stdout and exits nonzero on failure with a
machine-readable error object — for example `unsupported_project_scope`,
`project_not_initialized`, `stale_effective_policy`, or
`conflicting_active_writer`. One writer at a time holds a lock under
`.dev/work/.locks/`.

## Running a specialist

Forge never calls a model itself, and a specialist is never invoked directly.
`dispatch` executes a **host adapter**: a local program, named by a
schema-valid JSON configuration inside the project root, that receives a bounded
context packet and returns a schema-valid specialist result.

```json
{
  "schema": 1,
  "id": "codex-readonly",
  "command": "node",
  "args": [
    ".claude/skills/ae-forge/scripts/codex-host.mjs",
    "--adapter-id", "codex-readonly",
    "--model", "<exact model id>",
    "--model-class", "smaller"
  ],
  "deterministic": false,
  "cacheable": false,
  "timeout_ms": 300000
}
```

```bash
node skills/ae-forge/scripts/forge.mjs dispatch \
  --id team-invitations --dispatch-id invite-audit \
  --specialist vault --stage audit \
  --host-config .dev/context/host-codex.json \
  --request "Audit the invitation acceptance path for authorization gaps" \
  --acceptance AC-INVITE-AUTHZ --inputs src/invites/accept.ts \
  --tools read --invariants "Report findings; change nothing" \
  --procedure "Trace every caller of acceptInvite to its authorization check" \
  --next-check "Record each unguarded path" --independent \
  --calls 1 --input-tokens 20000 --output-tokens 4000 --context-tokens 20000
```

Before any model runs, the runner performs a capability handshake: it reads and
secret-scans the configuration, executes the adapter with `--capabilities`, and
validates the observed reply. The dispatch is refused when:

- the observed adapter id does not match the configured id;
- the host cannot enforce the packet's write boundary;
- `--independent` or a `diagnosis` stage is requested and the host reports
  shared context or no fresh context;
- the specialist is not in this run's selected team, or the stage is not one
  that specialist and the current run state both allow;
- a requested tool or write path falls outside effective authority, or
  `command` execution is not permitted at all;
- the observed model class conflicts with the run's model profile;
- complete evidence for the same bounded task on the same candidate already
  exists.

What the specialist receives is a bounded packet, not the repository: exact
file inputs with content digests, acceptance ids, invariants, a procedure, a
next check, allowed tools and writes, the reserved budget, the workflow and
contract digests, and the candidate identity. A packet larger than the run's
context budget is refused before dispatch.

What comes back is validated before it is persisted: the result must match the
result schema and bind to this run, dispatch, and specialist; every reported
artifact change must lie inside the packet's write scope and match the file's
current digest; `MEASURED` evidence must resolve to a real runner-issued receipt
on the current candidate. Packet, brief, result, and record are hashed into a
dependency key, so reusing a dispatch id succeeds only when every bound input is
unchanged. A repairable schema or contract failure may be retried once with
`--retry-of`; transport, permission, secret, and budget failures are not.

### The shipped adapter

`skills/ae-forge/scripts/codex-host.mjs` is the only host adapter in the kit. It
drives a local Codex CLI and observes its own capabilities by inspecting that
CLI's version and `exec` flags. Its constraints are real and worth knowing
before you plan a run:

- **Read-only.** It refuses any packet that carries write paths or any tool
  other than `read`. It cannot perform implementation writes. Making model-made
  file changes would require a different adapter, written against the same
  configuration and result schemas.
- **No model shell.** Each dispatch runs as a fresh ephemeral process in a
  disposable workspace under the dispatch directory, with the shell tool, apps,
  plugins, browser use, computer use, image generation, multi-agent modes, and
  skill search disabled, and approvals pinned inside a read-only sandbox.
- **Routed context only.** Inputs are verified against their packet digests and
  embedded as UTF-8 text; non-UTF-8 or NUL-bearing input is refused.
- **Exact model selection.** It passes the configured model id through
  unchanged and declares the configured model class; it infers neither.
- **Host-measured usage.** Input, output, reasoning, and cached token counts
  come from the CLI's own telemetry and are recorded as measured. Monetary
  charge and cancellation acknowledgement are reported as unavailable and must
  never be presented as measured.

## Runner-owned verification

A specialist cannot certify its own work. No one — including Judge — may
hand-write a command receipt. During `audit`, `verification`, or `repair`, the
declared quality command is run by the runner itself, which measures the exit
code and output digest directly:

```bash
node skills/ae-forge/scripts/forge.mjs verify --id team-invitations \
  --receipt-id invite-tests --command "npm test"
```

The command must appear verbatim in the effective quality policy's
`required_commands`, and effective authority must permit host execution. The
receipt records the invocation, exit code, timing, the SHA-256 and byte length
of the output, and the candidate identity. The raw output is never stored, and
output beyond the evidence limit fails the command instead of being truncated
into a receipt. Reusing a receipt id for a different command is refused.

Candidate identity is the exact working tree: the `HEAD` commit, the tracked
diff, and every untracked file outside `.dev/work/`. Touch the tree and prior
receipts no longer describe it, which is what makes evidence go stale honestly
instead of silently.

`ready_for_pr` fails closed without a passing receipt for every required
command on the current candidate, without an independent Judge dispatch in
`verification` covering every implemented acceptance id, and without every open
finding recorded in `reviews/release-audit.md`.

## Budgets, execution tiers, and model profiles

Every run carries a budget from the moment it starts. Work is reserved against
that budget **before** dispatch, reconciled with actual usage afterwards, and a
run that would pass a limit halts instead of overrunning it. Unreported token
counts are recorded as estimated rather than measured, and never upgraded.

| Tier | Calls | Input tokens | Output tokens | Packet tokens | Wall time | Repairs | Escalations |
|---|---:|---:|---:|---:|---:|---:|---:|
| small | 12 | 240,000 | 48,000 | 40,000 | 60 min | 1 | 2 |
| medium | 24 | 600,000 | 120,000 | 80,000 | 180 min | 2 | 6 |
| large | 40 | 1,400,000 | 280,000 | 120,000 | 360 min | 3 | 10 |
| hard maximum | 48 | 1,800,000 | 360,000 | 160,000 | 480 min | 3 | 12 |

The tier comes from `.dev/policy/routing.yml`, bounded by project authority and
by host constraints; `ae-init` generates `budget_tier: small`. A per-run
override at `start` may only narrow: it cannot exceed the project tier.

**Execution tiers** are `light`, `standard`, and `deep`. The runner classifies
each request deterministically from its kind, signals, blast radius,
reversibility, sensitivity, uncertainty, and cross-system scope, then takes the
highest of the classified tier, the project floor, and the previous tier. Risk
can rise but never fall, explicit inputs may raise it but never lower it, and a
filename match is recorded as a lead, never as proof. Bug and performance
requests additionally require a tested Probe diagnosis before definition.
`ae-init` generates `execution_tier: standard`.

**Model profiles** decide what model work is allowed to run on:

| Profile | Behavior |
|---|---|
| `smaller-model-only` | Every dispatch uses the selected smaller model. A host reporting a strongest-class model is rejected outright; there is no silent escalation. |
| `mixed` | Starts on the smaller model and permits a stronger one only with an explicitly recorded `--model-escalation-reason`, within authority, budget, and the escalation count. |

`ae-init` generates `model_profile: smaller-model-only`. A per-run override
cannot add stronger-model escalation to a smaller-model-only project profile,
and every dispatch records the actual host model it observed. The runner
hardcodes no model; model identity is always a host observation.

## Secret handling

Evidence is scanned before it is stored. Private keys, cloud access keys,
provider and platform tokens, bearer tokens, and credential-shaped assignments
are detected in the host configuration, the observed host capabilities, the
context packet and brief, the specialist result, and every artifact the
specialist reports changing. A hit blocks the dispatch or the result rather
than persisting it. Host failure messages are redacted before they are recorded,
and `doctor` re-scans stored dispatch evidence so a problem introduced by hand
is still caught.

This is pattern matching, not proof of absence. It is why `.dev/work/` stays out
of git.

## Local state, interruption, and recovery

`.dev/work/` is git-ignored local state, and its durability boundary is narrow
enough to state plainly:

- **It survives** a crashed process, a closed terminal, an ended session, and a
  reboot — anything that leaves the same checkout in place. Resume with
  `status`, `doctor`, and `resume`.
- **It does not survive** deleting the directory, `git clean -fdx` (which
  removes ignored files), a fresh clone, or a different machine. There is no
  remote copy and no reconstruction path.

Do not commit run state to make it durable. It holds specialist evidence,
review transcripts, and command output digests, and it is ignored deliberately.
If you need a copy, take one deliberately and store it where you would store
other sensitive working material.

`pause` records the prior state, a reason code, and the action needed to
continue; `resume` returns to exactly that state, re-checking required artifacts
and — after approval — the approval binding before it lets work continue.
Budget exhaustion and failed dispatches halt the run the same way rather than
continuing. `doctor` is the command to run after any interruption: it reports
stale candidates, broken digests, missing dispatch evidence, reservations that
should be resumed rather than repeated, and it restates that host memory and
unavailable telemetry are not evidence.

## Project status

The kit is functional and covered by the automated suite below. **Its
performance and cost characteristics are unevaluated.** The bounded comparative
evaluation that would have measured them was deliberately deferred, and nothing
has been substituted for it — see `docs/decisions/phase-0b-deferral.md`.

So this README makes no performance, cost, speed, quality, or model-equivalence
claim, and none may be added before that evaluation is actually run. The kit's
own position is that an unmeasured claim is not evidence; that applies to its
documentation first.

Current scope limits, stated once:

- Git projects only; non-Git projects are rejected.
- One shipped host adapter, and it is read-only.
- Monetary cost is never measured by the shipped adapter.
- No model identities are pinned or recommended.

## Development

```bash
npm test
```

The suite validates public skill ownership, specialist and lens registries,
plugin manifests, runtime schema instances and references, strict policy YAML,
policy compilation, every allowed and forbidden state pair, the Alpha seed and
repair behavior, scaffold hygiene, knowledge and policy generation, risk-based
routing, path containment, and approval invalidation. On Git Bash for Windows,
set `TMPDIR` to a native path before running the shell tests.

See `docs/DEVELOPMENT-KIT-PRD.md` for the product requirements and architectural
decisions.

## License

MIT
