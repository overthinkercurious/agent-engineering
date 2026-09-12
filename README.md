# agent-engineering

A development workflow suite for AI coding agents. It installs into any
project, reads the codebase once, and leaves behind a knowledge base and a set
of enforceable rules that every later session can load instead of rediscovering
the project from scratch.

Works across AI coding tools. Stays out of your git history.

## The problem

AI-assisted development reliably produces working code and unmaintainable
projects. Nothing in the loop enforces where files go, what "done" means, or
whether a claimed check actually ran. And every session starts by re-deriving
the same facts about the codebase, badly.

This fixes the second problem so it can start on the first: one expensive pass
over the repository, producing artifacts that make every later task cheap. As
much of it as possible sits behind an exit code rather than behind a prompt.

## Install

```bash
npx skills add overthinkercurious/agent-engineering --copy -y
```

Then, inside your agent:

> set up agent-engineering in this project

That is the whole flow. One command installs the suite, one sentence runs it.

**`--copy` is not optional.** By default the skills CLI symlinks each tool's
directory to `.agents/skills/`. Git for Windows does not create symlinks unless
Developer Mode is on, so a symlink clones back as a text stub and the skill
silently disappears. `--copy` writes real directories.

**`-y` skips the interactive picker.** Drop it if you want to choose.

### Supported tools

| Tool | Skills land in | Reads |
|---|---|---|
| Claude Code | `.claude/skills/` | `CLAUDE.md`, which imports `AGENTS.md` |
| Codex, Cursor, Antigravity, Copilot, Gemini CLI, OpenCode and 16 others | `.agents/skills/` | `AGENTS.md` |

Paths come from the skills CLI's own agent registry, not from documentation.
See `skills/ae-setup/references/targets.yml` for the table and its provenance.

## What setup does

Four stages. Each has one owner, reads what the previous stage wrote, and
produces exactly one artifact.

| # | Stage | Owner | Artifact |
|---|---|---|---|
| 1 | Scaffold | `scaffold.sh` | `.dev/`, `ENGINEERING.md`, pointer blocks, `.gitignore` |
| 2 | Analyze | `analyze.mjs` | `.dev/context/analysis.json` |
| 3 | Knowledge | `knowledge.mjs` + the model | `.dev/knowledge/*.md` |
| 4 | Rules | `rules.mjs` + the model | `.dev/rules/*.md` |
| — | Verify | `doctor.sh` | an exit code |

Stages 1 and 2 involve no model judgment at all. Stages 3 and 4 are split: the
script writes every fact it can extract from the analysis, and the model fills
only the marked judgment slots. **A fact in these files was never guessed** —
it came out of the parser — which is the property that makes the output worth
trusting later.

Running setup twice changes nothing it does not need to change.

### The knowledge base

```
.dev/knowledge/
├── 00-index.md          # routing table: which document answers which question
├── 10-stack.md          # languages, dependencies, enforcement config
├── 20-commands.md       # how to run, test, build - read from manifests and CI
├── 30-architecture.md   # fan-in ranking, routes, schema, reading order
├── 40-risks.md          # auth, money, data, secrets - and which lack tests
└── 50-conventions.md    # patterns, and where they disagree with each other
```

Later sessions load the one document they need, not the whole repository.

Each file has a managed block. Regenerating replaces the block and preserves
everything outside it, so corrections you write under `## Notes` survive.

### The rules

`.dev/rules/` holds project rules under a single admission test:

> A rule is admitted only if it names a command that fails when the rule is
> broken.

A rule with no enforcement is a suggestion, and suggestions accumulate until
nobody reads the file. `rules.mjs` derives what the project can already
enforce; if a project has no test, lint or typecheck command, the rules index
says so plainly instead of inventing rules nothing can check.

Rules apply to code you change, never to code that already exists. Existing
breakages are recorded as debt with a count that may go down and must not go
up.

## The suite is a dependency, not your code

Installed skills are **gitignored**. Your repository holds your codebase and
your project's own records, never the suite.

| Committed | Ignored |
|---|---|
| `AGENTS.md`, `CLAUDE.md` (pointer blocks) | `.claude/skills/ae-*/` |
| `ENGINEERING.md` (yours, written once) | `.agents/skills/ae-*/` |
| `.dev/knowledge/`, `.dev/rules/` | `.dev/kit/` |
| `.dev/tasks/`, `.dev/decisions/` | `.dev/scratch/`, `.dev/context/`, `.dev/evidence/` contents |
| `.dev/kit-version`, `skills-lock.json` | |

The ignore rules are scoped to the `ae-` prefix, so **any skills you write
yourself stay tracked**. Ignoring `.claude/skills/` wholesale would silently
stop tracking your own work.

### Restoring after a clone

```bash
npx skills add overthinkercurious/agent-engineering --copy -y
```

The same command. `skills-lock.json` records what the project expects, and
`npx skills check` / `npx skills update` work against it. Do not reach for
`npx skills experimental_install`: it only ever restores into `.agents/skills/`
and ignores `-a`, so Claude Code would not see the result.

The knowledge base is committed, so a fresh clone has it before the suite is
reinstalled. The pointer block in `AGENTS.md` carries the restore instructions,
so the repo tells a new teammate what to do.

## Verify

```bash
bash .dev/kit/scripts/doctor.sh
```

Exits non-zero when anything is missing or stale, and says which thing. That
exit code is the point: it is the part of the install story that does not
depend on a model being careful.

If that path does not exist, the suite is not installed in this clone yet.

## Suite layout

```
skills/ae-setup/
├── SKILL.md                    # the entry point: the four-stage chain
├── scripts/                    # the deterministic owners
│   ├── scaffold.sh   analyze.mjs   knowledge.mjs   rules.mjs
│   ├── doctor.sh                   lib.sh          kit-version.txt
├── references/
│   ├── targets.yml             # the only tool-specific file in the kit
│   └── stages/                 # the model-driven owners
│       ├── 3-knowledge.md      # how to fill the judgment slots
│       └── 4-rules.md          # the admission test and the ratchet
└── assets/                     # templates written into target projects
```

One installed skill. The stages are reference files rather than separate
skills because skill metadata sits in context for every session whether or not
it fires — `docs/decisions/0001` has the reasoning, and it is the same reason
the specialist roster will live as references too.

## Design

`docs/decisions/` holds the architecture decision records: what was chosen,
what was rejected and why. Those are the only design documents this repo
treats as current.

## Status

| Scope | State |
|---|---|
| Install: scaffold, doctor, the full four-stage chain | done, 92 assertions |
| Analysis, knowledge base and rules generation | done, 68 assertions |
| Model-side synthesis for stages 3 and 4 | authored, not yet evaluated |
| Gates, orchestrator, specialist roster | not started |

`npm test` runs all 160 of them.

On Git Bash for Windows, set `TMPDIR` to a native path first
(`export TMPDIR="C:/Users/you/AppData/Local/Temp"`) — MSYS does not translate
a path embedded inside a `node -e` string, and the harness needs its own temp
files back.

## Contributing

Read `CONTRIBUTING.md`, then run:

```bash
npm test
```

The authoring rules are enforced mechanically by `scripts/validate-suite.sh`.
A convention that is only written down drifts as soon as the roster grows.

## License

MIT
