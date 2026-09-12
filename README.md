# agent-engineering

One skill that reads a codebase once and writes down what it found, so every
later AI session loads the answer instead of re-deriving it badly.

Works across AI coding tools. Stays out of your git history.

## Install

```bash
npx skills add overthinkercurious/agent-engineering --copy -y
```

Then, inside your agent:

> index this project with ae-init

Or type `/ae-init` in Claude Code.

**`--copy` is not optional.** By default the skills CLI symlinks each tool's
directory to `.agents/skills/`. Git for Windows does not create symlinks unless
Developer Mode is on, so a symlink clones back as a text stub and the skill
silently disappears. `--copy` writes real directories.

**This repository is private**, so `npx skills add` needs a GitHub credential
that can read it — `gh auth login`, or a `GITHUB_TOKEN` in the environment.
Without one the CLI reports the repo as not found.

### Supported tools

| Tool | Skills land in | Reads |
|---|---|---|
| Claude Code | `.claude/skills/` | `CLAUDE.md`, which imports `AGENTS.md` |
| Codex, Cursor, Antigravity, Copilot, Gemini CLI, OpenCode and 16 others | `.agents/skills/` | `AGENTS.md` |

Paths come from the skills CLI's own agent registry, not from documentation.
See `skills/ae-init/references/targets.yml` for the table and its provenance.

## What `ae-init` does

Four stages. Each has one owner, reads what the previous stage wrote, and
produces exactly one artifact.

| # | Stage | Owner | Artifact |
|---|---|---|---|
| 1 | Scaffold | `scaffold.sh` | `.dev/`, pointer blocks, `.gitignore` |
| 2 | Analyze | `analyze.mjs` | `.dev/context/analysis.json` |
| 3 | Knowledge | `knowledge.mjs` + the model | `.dev/knowledge/*.md` |
| 4 | Rules | `rules.mjs` + the model | `.dev/rules/*.md` |
| — | Verify | `doctor.sh` | an exit code |

Stages 1 and 2 involve no model judgment at all. Stages 3 and 4 are split down
the middle: the script writes every fact it can extract from the analysis, and
the model fills only the slots marked `TODO (judgment)`.

**A fact in these files was never guessed** — it came out of a parser. That is
the property that makes the output worth trusting later, and the reason the
failure mode is a visible blank rather than a plausible fabrication.

Stage 2 always offers a free `--estimate` pass first, so you see what the real
pass would read and roughly what it costs before approving it.

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

Later sessions load the one document they need, not the whole repository. The
pointer block written into `AGENTS.md` is what routes them there.

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

## What is committed, and what is not

| Committed | Ignored |
|---|---|
| `.dev/knowledge/`, `.dev/rules/` — the deliverable | `.claude/skills/ae-*/` |
| `AGENTS.md`, `CLAUDE.md` (pointer blocks) | `.agents/skills/ae-*/` |
| `skills-lock.json` | `.dev/context/` — regenerable analysis dump |

The ignore rules are scoped to the `ae-` prefix, so **any skills you write
yourself stay tracked**. Ignoring `.claude/skills/` wholesale would silently
stop tracking your own work.

The suite is a dependency, restored with the same one command after a clone.
The knowledge base is not — it is committed, so a fresh clone has the project's
own record of itself before anything is reinstalled.

## Verify

```bash
bash .claude/skills/ae-init/scripts/doctor.sh
```

Exits non-zero when something is missing, and says which thing. That exit code
is the point: it is the part of the story that does not depend on a model being
careful.

## Layout

```
skills/ae-init/
├── SKILL.md                    # the entry point: the four-stage chain
├── scripts/                    # deterministic owners
│   scaffold.sh  analyze.mjs  knowledge.mjs  rules.mjs  doctor.sh  lib.sh
├── references/
│   ├── targets.yml             # the only tool-specific file in the kit
│   └── stages/                 # model-driven owners
│       knowledge.md  rules.md
└── assets/                     # templates written into target projects
```

One installed skill. The stages are scripts and reference files rather than
sibling skills: skill metadata sits in context for every session whether or not
it fires, and four skills claiming overlapping trigger phrases is a coin flip.

## Tests

```bash
npm test
```

124 assertions: the authoring contract, scaffold and doctor behaviour, and the
generated artifacts.

On Git Bash for Windows, set `TMPDIR` to a native path first
(`export TMPDIR="C:/Users/you/AppData/Local/Temp"`) — MSYS does not translate a
path embedded inside a `node -e` string, and the harness needs its own temp
files back.

## Status

Built and tested: the install path, all four stages, and the verifier. The
model-side halves of stages 3 and 4 are authored but have not been evaluated
against a range of real codebases yet.

Not started: the workflow skills that consume these artifacts.

## License

MIT
