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
npx skills@1.7.0 add overthinkercurious/agent-engineering --agent AGENT_ID --copy -y
```

| IDE or coding agent | `AGENT_ID` | Installed project location | Discover or invoke |
|---|---|---|---|
| Antigravity IDE | `antigravity` | `.agents/skills/` | `/ae-init` or `/ae-forge` |
| Antigravity CLI | `antigravity-cli` | `.agents/skills/` | `/skills`, then name the skill |
| Gemini CLI | `gemini-cli` | `.agents/skills/` | `/skills reload`, then name the skill |
| Codex | `codex` | `.agents/skills/` | `/skills` or `$ae-forge` |
| Cursor | `cursor` | `.agents/skills/` | Type `/` and select the skill |
| OpenCode | `opencode` | `.agents/skills/` | Ask naturally; OpenCode loads it with its skill tool |
| GitHub Copilot | `github-copilot` | `.agents/skills/` | `/ae-forge` or `copilot skill list` |
| Claude Code | `claude-code` | `.claude/skills/` | `/ae-init` or `/ae-forge` |

These are not guessed compatibility paths. `.agents/skills` is an officially
supported project location for every tool assigned to it above. Claude Code is
the exception and receives its own native `.claude/skills` copy. The mapping is
also verified against the installer registry and by an executable acceptance
test for every `AGENT_ID`.

For example, Antigravity IDE needs exactly:

```bash
npx skills@1.7.0 add overthinkercurious/agent-engineering --agent antigravity --copy -y
```

The command is project-scoped: it downloads both complete skill directories,
puts them where the selected IDE discovers them, and writes `skills-lock.json`.
`--copy` avoids cross-platform symlink failures. Do not add `-g`; project scope
is the portable contract and records the installed content with the repository.

For Antigravity, run the command from the root of the project that is open in
the IDE. A successful install has this exact shape:

```text
your-project/
  .agents/skills/ae-init/SKILL.md
  .agents/skills/ae-forge/SKILL.md
```

Then start a new Antigravity conversation and ask:

> Use ae-init to index and configure this project.

After that, normal work starts with a request such as:

> Use ae-forge to implement team invitations, prevent cross-tenant access, and
> independently verify the result.

Initialization is optional. `ae-forge` can work directly from an uninitialized
repository.

### Antigravity activation

Current Antigravity versions support both semantic activation and skill slash
commands. Use `/ae-init`, `/ae-forge`, or a normal request such as "Use ae-forge
to build and verify password reset."

If Antigravity does not list or use the skills:

1. Check that the two `SKILL.md` files exist at the exact paths shown above in
   the project currently open in Antigravity.
2. If they do not, open a terminal at that project's root and rerun the
   Antigravity install command.
3. Start a new conversation so Antigravity refreshes the available skill names
   and descriptions. If the `.agents` directory was added after the workspace
   was opened and the skills still do not appear, fully quit and reopen
   Antigravity with that project root; then use `/ae-init` or `/ae-forge`.

Antigravity CLI users can also run `/skills` to browse loaded skills.

### Multiple IDEs and updates

Install for every IDE used on the project in one command:

```bash
npx skills@1.7.0 add overthinkercurious/agent-engineering --agent antigravity --agent cursor --agent claude-code --copy -y
```

Antigravity, Gemini CLI, Codex, Cursor, OpenCode, and GitHub Copilot share the
same `.agents/skills` copy, so those tools cannot drift from one another inside
a project. Claude Code reads its required `.claude/skills` copy.

The installer writes `skills-lock.json`; commit that file as the project's
source and content-hash record. Installed skill directories remain ignored
dependencies. Updates are deliberate rather than automatic, so a workflow
cannot change silently while work is in progress.

To refresh, rerun the same install command with the same `--agent` values. It
downloads the latest kit, replaces every selected copy, and refreshes the lock
record while preserving the Windows-safe `--copy` installation mode. Afterward,
use the reload action in the table above or start a new conversation. The
installer also provides `npx skills@1.7.0 update --project -y`, but repeating the
explicit install command is this kit's supported update path because the target
IDEs and copy mode remain unambiguous.

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
