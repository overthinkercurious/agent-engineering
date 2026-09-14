# AGENTS.md

Context for AI tools working on this repository, not on a project where the kit
is installed.

## What this repository is

Agent Engineering ships two public skills. `ae-init` builds a project's durable
knowledge, rules, and operating policy. `ae-forge` is the sole work
orchestrator: it routes requests to internal specialists and lenses, enforces a
state machine, records approval, and requires independent verification.

The README describes the product, scripts own deterministic behavior, workflow
references own model judgment, and the tests define working behavior. Nothing
outside this repository is binding on it.

## Layout

| Path | Role |
|---|---|
| `skills/ae-init/` | Project indexing, knowledge, rules, and policy generation |
| `skills/ae-forge/` | Public orchestrator, specialist registry, workflows, and runner |
| `skills/ae-forge/references/specialists/` | Full internal specialist workflows |
| `skills/ae-forge/references/lenses/` | Narrow review lenses with escalation targets |
| `.codex-plugin/` | Native Codex package manifest |
| `.claude-plugin/` | Native Claude Code plugin and marketplace manifests |
| `scripts/` | Repository validation and acceptance tests; never shipped inside a skill |

Everything a skill needs at runtime lives inside its own directory. The Skills
CLI copies only skill directories, so a root-level runtime file is unreachable
after a project-scoped install.

## Commands

```bash
npm test
bash scripts/validate-suite.sh
node scripts/validate-forge.mjs
bash scripts/test-scaffold.sh
bash scripts/test-artifacts.sh
bash scripts/test-forge.sh
```

All checks must pass before any commit touching `skills/` or `scripts/`. On Git
Bash for Windows, set `TMPDIR` to a native path such as
`C:/Users/you/AppData/Local/Temp` first.

Node owns portable runtime scripts because an `npx` install proves Node exists;
Python is not assumed. Runtime scripts have no package dependencies.

## Invariants

- **Deterministic before probabilistic.** A check that can return an exit code
  belongs in a script.
- **Evidence and judgment stay distinct.** Generated evidence comes from
  `analysis.json`; the model writes only explicit judgment slots. Unknowns stay
  visible.
- **Two public routing surfaces.** `ae-init` owns initialization and `ae-forge`
  owns later work. Specialists and lenses are internal workflow references so
  their trigger phrases cannot compete globally.
- **No specialist invokes another specialist.** It returns a structured
  `needs_specialist` request. Forge decides whether to dispatch it, which keeps
  budgets, cycles, and audit history under one owner.
- **Ownership does not overlap.** Every public skill and internal specialist
  has one exclusive outcome. `validate-suite.sh` and `validate-forge.mjs`
  enforce uniqueness.
- **Names are global.** Public skill directories and frontmatter names use the
  `ae-` prefix. Internal short names are scoped by the Forge registry.
- **The installed suite is a dependency.** Ignore only installed `ae-*`
  directories. Commit `.dev/knowledge/`, `.dev/rules/`, `.dev/policy/`, and
  `skills-lock.json`. Ignore `.dev/context/` and `.dev/work/`.
- **Only scaffold consumed artifacts.** Do not add empty directories until a
  runtime workflow reads them.
- **Approval binds content.** Implementation cannot begin until authoritative
  artifacts exist, contain no TODOs, and are hashed in `approval.json`. Later
  edits invalidate the receipt.
- **Verification is independent.** Probe owns test design and Judge owns the
  final release verdict. An implementer cannot self-certify completion.
- **Every tool-specific fact lives in `targets.yml`.** Adding a tool is a data
  change, not conditional script logic.
- **Antigravity uses native workspace locations.** Skills live in
  `.agents/skills/`; `ae-init` writes its persistent pointer into
  `.agents/rules/agent-engineering.md`.
- **Portable shell stays Bash 3.2 compatible.** Do not use associative arrays,
  `mapfile`, `sed -i`, or non-POSIX awk. Pin shell, Node, Markdown, YAML, and
  JSON files to LF.
- **Never write outside the target project root.** Normalize paths and reject
  escapes. Preserve user content outside managed markers.

## Authoring a public skill

Frontmatter needs a directory-matching, `ae-` prefixed `name`, a routing-rich
`description`, and a unique `metadata.owns` phrase. Keep the body under 500 lines and
move detailed procedures into references with explicit instructions for when
to read them.

Never call a bundled script relative to the caller's working directory. Resolve
the skill directory first. `${CLAUDE_SKILL_DIR}` always needs fallbacks for
`.agents/skills/` and `.claude/skills/`.

## Adding a specialist or lens

Add exactly one workflow file below `skills/ae-forge/references/`, then add one
registry entry with unique ownership or coverage, triggers, and an escalation
target for a lens. Specialists return the envelope defined by
`specialist-result.schema.json`; findings use `finding.schema.json`. Do not add
a sibling public skill.

## Adding a tool

Add a block to `skills/ae-init/references/targets.yml` with its instruction
file, pointer style, skills directory, detection signals, confidence, and
provenance. Read installation paths from the Skills CLI registry and verify
instruction behavior against the tool's primary documentation.
