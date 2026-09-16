# Agent Engineering

Agent Engineering gives a coding agent a small autonomous team for taking a
software request from intent to implementation and independent verification.
It is designed for people who want to describe the outcome, not operate an
agent framework.

The kit ships two public skills:

- **ae-forge** is the everyday entry point. It selects a risk-sized team,
  plans, implements, verifies, repairs findings, and reports the result.
- **ae-init** optionally builds durable project knowledge and rules for large
  or long-lived repositories. Forge does not refuse work when initialization
  has not been run.

## The normal experience

Ask for the outcome:

> Add team invitations and make sure one tenant cannot invite users into
> another tenant.

Forge handles the workflow:

1. It reads the project instructions and relevant code.
2. It selects the smallest useful team.
3. The team plans and implements the change.
4. A verifier reviews the exact diff and runs relevant checks.
5. Forge repairs valid findings and returns the delivered behavior, evidence,
   and any remaining risk.

The user does not choose roles, create workflow artifacts, run state commands,
or understand the internal lifecycle.

## The team

Forge has nine internal experts. Each has a dedicated workflow and one
exclusive outcome:

| Role | Used when |
|---|---|
| Product | A new idea or feature outcome is genuinely ambiguous |
| Investigator | A bug or performance problem has no demonstrated cause |
| Architect | A meaningful design or multi-file change needs a safe plan |
| Security | Trust, authorization, privacy, abuse, or payment risk is present |
| Data | Stored-data invariants, migration, backfill, or recovery is affected |
| Experience | A user journey, interface state, or accessibility behavior changes |
| Reliability | Runtime failure, concurrency, performance, or recovery is affected |
| Builder | Code, tests, or configuration must change |
| Verifier | The implemented result needs independent inspection |

Builder and Verifier are the minimum delivery team. Most changes use Architect,
Builder, and Verifier. Other experts are selected only when their exclusive
boundary is present. Audit-only requests use Verifier plus only the relevant
Architect or named specialist and do not modify code.

### Risk-sized operation

| Tier | Typical use | Default team |
|---|---|---|
| Quick | Local, reversible, well-understood correction | Builder, Verifier |
| Standard | Meaningful feature, refactor, or multi-file change | Architect, Builder, Verifier |
| Deep | Security, payments, destructive data, public contracts, difficult rollback | Architect, relevant named specialist, Builder, Verifier |

An Investigator is added for unknown bugs and performance problems. Product is
added for ambiguous ideas. Experience is selected for user-facing journeys;
Security, Data, and Reliability are selected for their named risk boundaries.
Five roles is the normal maximum; Forge explains when genuinely independent
risks require more.

## Autonomy and approval

Forge proceeds through routine, reversible engineering decisions without
interrupting the user. It asks once when work requires a material product
choice, destructive or irreversible action, external side effect, new access or
spending, production deployment, or acceptance of a serious unresolved risk.

Planning is not treated as delivery. Completion for a requested change requires:

- an implementation contribution;
- an independent verification contribution;
- relevant project checks;
- no unresolved critical or high finding;
- a concise delivery report.

An audit-only request requires independent verification and a findings report,
not an artificial implementation contribution.

## Installation

Open a terminal in the project you want to develop and run one command. Replace
`AGENT_ID` with the identifier for your IDE:

```bash
npx skills add overthinkercurious/agent-engineering --agent AGENT_ID --copy -y
```

| IDE or coding agent | `AGENT_ID` | Project skill location |
|---|---|---|
| Antigravity IDE | `antigravity` | `.agents/skills/` |
| Antigravity CLI | `antigravity-cli` | `.agents/skills/` |
| Gemini CLI | `gemini-cli` | `.agents/skills/` |
| Codex | `codex` | `.agents/skills/` |
| Cursor | `cursor` | `.agents/skills/` |
| OpenCode | `opencode` | `.agents/skills/` |
| GitHub Copilot | `github-copilot` | `.agents/skills/` |
| Claude Code | `claude-code` | `.claude/skills/` |

For example, Antigravity IDE needs exactly:

```bash
npx skills add overthinkercurious/agent-engineering --agent antigravity --copy -y
```

The command is project-scoped: it downloads both complete skill directories,
puts them where the selected IDE discovers them, and writes `skills-lock.json`.
`--copy` avoids cross-platform symlink failures. Do not add `-g`; project scope
is the portable contract and keeps the kit version tied to the repository.

Reload the IDE's skills or begin a new task, then ask:

> Use ae-init to index and configure this project.

After that, normal work starts with a request such as:

> Use ae-forge to implement team invitations, prevent cross-tenant access, and
> independently verify the result.

Initialization is optional. `ae-forge` can work directly from an uninitialized
repository.

The skills require Node.js. ae-init also uses Bash for its optional scaffold
and doctor commands.

### Runtime expectations

Forge needs a coding host that can read and edit project files and run project
checks. Native isolated agents provide genuinely independent expert passes. On
a host without them, Forge uses explicit sequential roles and discloses that
the final review was not context-independent.

Forge never treats installation as permission to deploy, publish, spend money,
access a new private system, or perform destructive work.

## Optional project initialization

Use ae-init when a repository is large, unfamiliar, or will be worked on
repeatedly. It creates .dev/knowledge and .dev/rules.
Initialization improves future context but is not a prerequisite for Forge.

## Internal recovery record

Forge keeps one small ignored record per active change at
.dev/work/<task-id>/run.json.

This record contains the selected team, current phase, expert contributions,
approval when required, and the final verification summary. It exists so an
interrupted task can resume safely. It is not a user-facing workflow.

The bundled runner supports:

| Command | Purpose |
|---|---|
| start | Create a run and select a risk-sized team |
| list | List current and completed runs |
| status | Read one run |
| note | Record a selected expert's material contribution |
| phase | Record a meaningful workflow boundary |
| approve | Record material user approval when required |
| finish | Close only after Builder and Verifier contributed |
| cancel | Stop an active run |

Agents invoke these commands internally. Users normally never do.

## Development

Run npm test. The test suite validates skill packaging, the small Forge
recovery contract, and the deterministic ae-init scripts.

## Design principles

- Use the smallest team that covers the actual risk.
- Delegate judgment; do not manufacture process.
- Implement and verify; do not stop after producing plans.
- Use native host agents instead of building another agent platform.
- Keep one lightweight recovery record, not a document tree.
- Ask users about material outcomes and authority, not workflow mechanics.
- State limitations and unknowns instead of fabricating assurance.

## License

MIT
