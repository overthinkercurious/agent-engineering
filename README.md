# Agent Engineering

Agent Engineering gives a coding agent a small autonomous team for taking a
software request from intent to implementation and independent verification.
It is designed for people who want to describe the outcome, not operate an
agent framework.

The kit ships two public skills:

- **ae-forge** is the everyday entry point. It selects a risk-sized team,
  plans, implements, verifies, repairs findings, and reports the result.
- **ae-surveyor** optionally builds durable project knowledge and rules for large
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
boundary is present, and that selection is **behavioural, not lexical**: Forge
answers a short set of questions about what the change actually does — does it
change who can reach anything, does it change stored shape, does it change a
rendered surface, does it change runtime behaviour, is any part irreversible —
and each answer maps deterministically to an expert. The wording of a request
never decides whether a review happens, so "add OAuth login", "wire up SSO"
and "add RBAC" all reach the Security expert.

Depth inside a boundary comes from **lenses** rather than more experts. A lens
attaches to an expert already working — it costs no extra dispatch — and
carries the domain specifics that go out of date, each with the date it was
last verified. Eight ship today, covering accessibility, secrets, web and
database performance, API contracts, test quality, Android, and UI finish.

Audit-only requests use Verifier plus only the relevant Architect or named
specialist, and do not modify code.

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
| Antigravity IDE | `antigravity` | `.agents/skills/` | `/ae-surveyor` or `/ae-forge` |
| Antigravity CLI | `antigravity-cli` | `.agents/skills/` | `/skills`, then name the skill |
| Gemini CLI | `gemini-cli` | `.agents/skills/` | `/skills reload`, then name the skill |
| Codex | `codex` | `.agents/skills/` | `/skills` or `$ae-forge` |
| Cursor | `cursor` | `.agents/skills/` | Type `/` and select the skill |
| OpenCode | `opencode` | `.agents/skills/` | Ask naturally; OpenCode loads it with its skill tool |
| GitHub Copilot | `github-copilot` | `.agents/skills/` | `/ae-forge` or `copilot skill list` |
| Claude Code | `claude-code` | `.claude/skills/` | `/ae-surveyor` or `/ae-forge` |

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
  .agents/skills/ae-surveyor/SKILL.md
  .agents/skills/ae-forge/SKILL.md
```

Then start a new Antigravity conversation and ask:

> Use ae-surveyor to index and configure this project.

After that, normal work starts with a request such as:

> Use ae-forge to implement team invitations, prevent cross-tenant access, and
> independently verify the result.

Initialization is optional. `ae-forge` can work directly from an uninitialized
repository.

### Antigravity activation

Current Antigravity versions support both semantic activation and skill slash
commands. Use `/ae-surveyor`, `/ae-forge`, or a normal request such as "Use ae-forge
to build and verify password reset."

If Antigravity does not list or use the skills:

1. Check that the two `SKILL.md` files exist at the exact paths shown above in
   the project currently open in Antigravity.
2. If they do not, open a terminal at that project's root and rerun the
   Antigravity install command.
3. Start a new conversation so Antigravity refreshes the available skill names
   and descriptions. If the `.agents` directory was added after the workspace
   was opened and the skills still do not appear, fully quit and reopen
   Antigravity with that project root; then use `/ae-surveyor` or `/ae-forge`.

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

The skills require Node.js. ae-surveyor also uses Bash for its optional scaffold
and doctor commands.

### Runtime expectations

Forge needs a coding host that can read and edit project files and run project
checks. Native isolated agents provide genuinely independent expert passes. On
a host without them, Forge uses explicit sequential roles and discloses that
the final review was not context-independent.

Forge never treats installation as permission to deploy, publish, spend money,
access a new private system, or perform destructive work.

## Optional project initialization

Use ae-surveyor when a repository is large, unfamiliar, or will be worked on
repeatedly. It creates .dev/knowledge and .dev/rules.
Initialization improves future context but is not a prerequisite for Forge.

## What you see, and what you get back

Forge prints the routing decision once, before any work starts — including
**what it decided to skip, and why**. A review the team chose not to run is the
one thing you cannot infer from the result, so it is always shown.

Then it stays quiet. A five-expert run produces about ten lines of progress,
whatever is happening underneath.

At the end you get one report, rendered from the run's own record rather than
recalled: the routing decision, what each expert contributed, **what each one
caught**, what was skipped and why, the checks that ran, and how many repair
cycles it took. Because it is generated from the record, the summary and the
work cannot disagree — which also makes it the instrument for checking that
routing is behaving.

## Working files

Forge keeps a small ignored working directory per change at
`.dev/work/<task-id>/`:

| File | Purpose |
|---|---|
| `run.json` | Team, phase, revision, approval, contributions — the recovery record |
| `brief.md` | The reviewable plan. Frozen once approved, so the audit can check what was delivered against what was agreed |
| `results/` | One append-only file per expert contribution |

The brief carries only the sections its risk tier calls for: four for a small
fix, eleven for a deep change. A four-page plan for a one-line fix is treated
as a defect, not thoroughness.

Together these make an interrupted task genuinely resumable — a new session
reads the approved brief and the results rather than re-planning.

The bundled runner supports:

| Command | Purpose |
|---|---|
| start | Create a run, assess risk, and select the team |
| brief | Scaffold the reviewable plan, sized to the risk tier |
| list | List current and completed runs |
| status | Read one run |
| note | Record an expert's contribution, severity, and result file |
| phase | Record a meaningful workflow boundary |
| approve | Record material user approval, freezing the brief |
| report | Render the delivery summary from the record |
| finish | Close only after implementation and verification contributed |
| cancel | Stop an active run |

Agents invoke these commands internally. Users normally never do.

## Development

Run `npm test`. The suite validates skill packaging, the Forge recovery and
routing contract, lens selection, the deterministic ae-surveyor scripts, and a
set of golden routing cases in `evals/`.

`evals/` also carries a fixture repository with deliberately planted defects —
an IDOR, an unbounded query, a missing reduced-motion guard, a non-idempotent
retry. Running a real model against those cases grades something the
deterministic suite cannot reach: not just whether the right expert was
called, but whether it was deep enough to find anything. See `evals/README.md`.

## Design principles

- Use the smallest team that covers the actual risk.
- Delegate judgment; do not manufacture process.
- Implement and verify; do not stop after producing plans.
- Use native host agents instead of building another agent platform.
- Route on behaviour, never on vocabulary; absence of a keyword is not safety.
- Keep a lightweight record and one approved brief, not a document tree.
- Put method in the experts and dated facts in the lenses, so depth can admit
  when it has gone stale.
- Render the report from the record, so the summary cannot drift from the work.
- Ask users about material outcomes and authority, not workflow mechanics.
- State limitations and unknowns instead of fabricating assurance.

## License

MIT
