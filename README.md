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
├── manifest.json          # request class, project revision, selected team
├── state.json             # legal workflow state and cost counters
├── intent.md              # authoritative outcome and constraints
├── discovery/             # specialist evidence and synthesis
├── design/                # approved product and technical definition
├── plan/                  # implementation and verification plan
├── implementation/        # integration record
├── reviews/               # plan, domain, and release audits
├── verification/          # command and acceptance evidence
└── approval.json          # hashes of the approved artifacts
```

The state machine permits only:

```text
created → classified → discovery → definition → plan review
→ awaiting approval → approved → implementation → integration
→ audit → verification → ready for PR → complete

audit or verification → repair → implementation
```

`awaiting specialist`, `blocked`, and `halted` preserve a validated resume
point. `cancelled` and `complete` are terminal. Repair never jumps directly to
verification; it returns through implementation, integration, and fresh audit.

The runner hashes intent, definition, implementation plan, and plan review when
the user approves them. Editing one later invalidates the approval. Probe owns
verification design on every plan; Judge independently owns the final release
verdict. Risk signals add specialists and lenses, while ordinary changes avoid
their cost.

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

The deterministic Forge runner has no dependencies:

```bash
node skills/ae-forge/scripts/forge.mjs start --title "Team invitations" --kind feature --signals ui,auth
node skills/ae-forge/scripts/forge.mjs status --id team-invitations
node skills/ae-forge/scripts/forge.mjs route --id team-invitations --signals tenant
node skills/ae-forge/scripts/forge.mjs advance --id team-invitations --to classified
node skills/ae-forge/scripts/forge.mjs approve --id team-invitations
node skills/ae-forge/scripts/forge.mjs check --id team-invitations
```

Agents normally run these commands through `ae-forge`; the CLI is documented
so state and approval behavior remain inspectable and testable.

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
