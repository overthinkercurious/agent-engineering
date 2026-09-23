# Agent Engineering

Agent Engineering gives a coding agent a small autonomous team for taking a
software request from intent to implementation and evidence-based verification.
It is designed for people who want to describe the outcome, not operate an
agent framework.

**ae-forge** is the delivery skill you need to name. It selects a risk-sized team,
drives each stage, enforces the gates, and reports the result.

Behind it are six internal stage skills and a first-run project survey.
`ae-forge` invokes `ae-surveyor` before the first new run in a repository, so
later requests can use durable project knowledge and rules:

| Skill | Stage |
|---|---|
| `ae-forge` | Orchestrator — routes, gates, owns the run artifact |
| `ae-investigate` | Establish the cause of a failure before anyone plans a fix |
| `ae-plan` | Write the implementation plan |
| `ae-plan-review` | Read a deep plan adversarially, before any code exists |
| `ae-build` | Implement the agreed brief |
| `ae-verify` | Independently verify the candidate and issue the verdict |
| `ae-audit` | Audit the repository cold, with no plan and no diff |
| `ae-surveyor` | First-run durable project knowledge and rules; refreshable later |

Stages run **sequentially, never concurrently**. The pairs that matter are
adversarial — a plan and its review, a build and its verification — and running
a pair at the same time means the reviewer is judging a moving target.

Every stage reads and writes one committed file, `.dev/runs/<id>.md`. Forge
uses isolated contexts where the host confirms they are available; otherwise
it executes stages sequentially in one session and reports that review context.
The artifact must let a new reader review and implement from it alone.

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

Forge has eleven internal experts. Each has a dedicated workflow and one
exclusive outcome:

| Role | Used when |
|---|---|
| Product | A new idea or feature outcome is genuinely ambiguous |
| Investigator | A bug or performance problem has no demonstrated cause |
| Architect | A meaningful design or multi-file change needs a safe plan |
| Plan Reviewer | Deep design risk warrants a separate plan review |
| Security | Trust, authorization, privacy, abuse, or payment risk is present |
| Data | Stored-data invariants, migration, backfill, or recovery is affected |
| Experience | A user journey, interface state, or accessibility behavior changes |
| Reliability | Runtime failure, concurrency, performance, or recovery is affected |
| Builder | Code, tests, or configuration must change |
| Verifier | The implemented result needs a separate verification pass |
| Auditor | The repository itself needs a cold read, with no plan and no diff |

Two of those exist because nobody else could answer their question. **Plan
Reviewer** owns "is this design wrong, before we build it" — Architect writes
the plan and Verifier judges the result, so without this role a design defect
is found in a diff rather than in a paragraph. It re-opens every citation the
plan makes; a reference that does not resolve is an automatic blocker.
**Auditor** owns "what is already wrong here", read cold: it deliberately does
not read the plan or the diff, because an auditor who knows what was intended
audits the intention.

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
last verified. Twenty ship today: accessibility, AI/LLM, API contracts,
Android, caching, compliance, database and web performance, i18n,
identity/auth, infrastructure, iOS, observability, payments, privacy,
queue/messaging, release engineering, secrets, test quality, and UI finish.

A domain the kit detects but has no lens for is announced as `LENS
UNAVAILABLE` rather than improvised — `realtime`, `collaborative-editing` and
`search-relevance` are named gaps today, and a role asked about one of them
says so instead of inventing an answer.

**The kit adapts to your project without being told.** It reads the survey's
sensor dump and derives the relevant domains from what the repository actually
contains — a Stripe dependency reaches the payments lens, an OpenAI dependency
reaches the AI/LLM lens, a React dependency reaches accessibility and web
performance. The change you asked for ranks first; the project fills what is
left. A domain it detects but has no lens for is reported as unavailable
rather than silently improvised, and a lens past its review date says so
instead of quoting a threshold nobody rechecked.

Audit-only requests use Auditor plus Verifier and any relevant named
specialist. They exclude Architect, Plan Reviewer and Builder — there is no
plan to review and nothing to implement — and they do not modify code.

### Risk-sized operation

| Tier | Typical use | Default team |
|---|---|---|
| Quick | Local, reversible, well-understood correction | Builder, Verifier |
| Standard | Meaningful feature, refactor, or multi-file change | Architect, Builder, Verifier |
| Deep | Security, payments, destructive data, public contracts, difficult rollback | Architect, relevant technical specialists, Plan Reviewer, Builder, Verifier |

An Investigator is added for unknown bugs and performance problems. Product is
added for ambiguous ideas. Experience is selected for user-facing journeys;
Security, Data, and Reliability are selected for their named risk boundaries.
Five roles is the normal maximum; Forge explains when genuinely independent
risks require more.

## Autonomy and approval

Forge works through implementation without interrupting for routine local
choices. It asks when an unresolved material product/design decision or new
authority is needed. Tier and risk select depth; neither alone requires user
approval. A reviewer verdict cannot grant user authority. Required approval
is recorded with the decision basis before Builder starts.

An audit-only run is never gated. It cannot enter build and cannot modify code,
so there is no action to authorise.

Separately, four actions are gated at the moment of action, every run, whatever
was approved earlier: pushing to a remote, merging, migrating a shared
environment, and anything that spends money. Approving a plan authorises the
change, never its release.

Planning is not treated as delivery. Completion for a requested change requires:

- an implementation contribution;
- a verification contribution with its review context recorded;
- relevant project checks;
- no unresolved critical or high finding;
- a concise delivery report.

An audit-only request requires verification and a findings report,
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

The command is project-scoped: it downloads all eight skill directories,
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

On the first new Forge request, the kit completes Surveyor before selecting a
feature team. Existing runs can resume without repeating the survey. Later
runs refresh the repository analysis and check whether the durable knowledge
is current.

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

The skills require Node.js. ae-surveyor also uses Bash for its scaffold
and doctor commands.

### Runtime expectations

Forge needs a coding host that can read and edit project files and run project
checks. Native isolated agents provide genuinely independent expert passes —
each dispatched expert gets a fresh context with only the request, the ledger,
and its own role file, so a Verifier reviews the repository rather than a
Builder's account of it. ae-surveyor resolves which hosts support this once,
at initialization, and publishes it to `.dev/context/host.json`; Forge looks
itself up there rather than assuming. On a host without isolated dispatch,
Forge uses explicit sequential roles and discloses that the final review was
not context-independent.

Forge never treats installation as permission to deploy, publish, spend money,
access a new private system, or perform destructive work.

## Optional project initialization

Forge runs ae-surveyor once before starting a new request in an uninitialized
repository. It creates `.dev/knowledge` and `.dev/rules`. Run ae-surveyor again
when the knowledge needs a refresh.

## What you see, and what you get back

Forge prints the routing decision once, before any work starts — including
**what it decided to skip, and why**. A review the team chose not to run is the
one thing you cannot infer from the result, so it is always shown.

The current handler, skill, lenses, phase, and last update are also visible in
`.dev/runs/<task-id>.md`. Its stage log fills as experts finish. The timestamp
shows the last recorded event, so a long step may remain unchanged until its
focus is updated or its result is recorded.

At the end you get one report, rendered from the run's own record rather than
recalled: the routing decision, what each expert contributed, **what each one
caught**, what was skipped and why, the checks that ran, and how many repair
cycles it took. Because it is generated from the record, the summary cannot
contradict the recorded contributions; Verifier still checks those claims
against repository state.

## Working files

Forge keeps a small ignored working directory per change at
`.dev/work/<task-id>/`:

| File | Purpose |
|---|---|
| `run.json` | Team, phase, revision, approval, contributions — the recovery record |
| `brief.md` | The reviewable plan. Frozen at approval or build, so the audit can check what was delivered against the agreed scope |
| `results/` | One append-only file per expert contribution |

The brief carries only the sections its risk tier calls for: four for a small
fix, eleven for a deep change. A four-page plan for a one-line fix is treated
as a defect, not thoroughness.

Together these make an interrupted task genuinely resumable — a new session
reads the frozen brief and the results rather than re-planning.

The bundled runner supports:

| Command | Purpose |
|---|---|
| start | Create a run, assess risk, and select the team |
| brief | Scaffold the reviewable plan, sized to the risk tier |
| lenses | Record which domain lenses attached, and why |
| list | List current and completed runs |
| status | Read one run |
| note | Record an expert's contribution, severity, and result file |
| focus | Record which role, skill, and lenses are handling the request now |
| phase | Record a meaningful workflow boundary |
| approve | Record material user approval, freezing the brief |
| audit | Run the deterministic release checks |
| report | Render the delivery summary from the record |
| finish | Close only after implementation and verification contributed |
| cancel | Stop an active run |

Agents invoke these commands internally. Users normally never do.

## Design principles

- Use the smallest team that covers the actual risk.
- Delegate judgment; do not manufacture process.
- Implement and verify; do not stop after producing plans.
- Use native host agents instead of building another agent platform.
- Route on behaviour, never on vocabulary; absence of a keyword is not safety.
- Keep a lightweight record and one frozen brief, not a document tree.
- Put method in the experts and dated facts in the lenses, so depth can admit
  when it has gone stale.
- Render the report from the record, so the summary cannot drift from the work.
- Ask users about material outcomes and authority, not workflow mechanics.
- State limitations and unknowns instead of fabricating assurance.

## License

MIT
