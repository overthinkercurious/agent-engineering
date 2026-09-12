# AGENTS.md

Context for AI tools working on **this repository** (the suite itself), not on a
project the suite is installed into.

## What this repo is

A suite of agent skills forming a development workflow system.

Nothing outside this repository is binding on it. The README states what the
suite does, the scripts define how, the test suite defines what "working" means,
and `docs/decisions/` records the choices that were not obvious, each argued on
its own merits. Read the ADRs before proposing anything structural; if one is
wrong, supersede it with a new ADR rather than working around it.

## Layout

| Path | Role |
|---|---|
| `skills/<ae-name>/SKILL.md` | One directory per installed skill. |
| `skills/<ae-name>/scripts/` | Deterministic logic. No model judgment. |
| `skills/<ae-name>/references/` | Data read at runtime, including `targets.yml` and, later, the specialist library. |
| `skills/<ae-name>/assets/` | Templates written into target projects. |
| `scripts/` | Repo maintenance only. Never shipped into a project. |
| `docs/`, `docs/decisions/` | Design context, briefs, ADRs. |

Everything a skill needs at runtime lives **inside its own directory**. The
skills CLI copies only the skill directory, so a file at the repo root is
unreachable from an installed skill. This is why `targets.yml` sits under
`references/` and not under a top-level `config/`.

## Commands

```bash
bash scripts/validate-suite.sh   # authoring contract, as an exit code
bash scripts/test-install.sh     # install, scaffold, full chain, 92 assertions
bash scripts/test-analyze.sh     # analyzer + knowledge + rules, 68 assertions
bash scripts/sync-version.sh     # after bumping VERSION
```

All three must pass before any commit that touches `skills/` or `scripts/`.
On Git Bash for Windows, set `TMPDIR` to a native path (e.g.
`C:/Users/you/AppData/Local/Temp`) or the test harness cannot resolve its own
temp files: MSYS translates a path passed as a whole argument but not one
embedded inside a `node -e` string.
`npm test` runs them in order.

The analyzer is Node rather than shell or Python: installing this suite goes
through `npx`, which proves Node exists on the machine. Python does not,
especially on Windows. It has no dependencies.

## Invariants

- **Skill names are global.** Install flattens the tree, so `skills/stages/ae-frame/`
  becomes `.claude/skills/ae-frame/`. Every name carries the `ae-` prefix, is
  unique across the suite, and matches its directory. `validate-suite.sh`
  enforces all three.
- **The suite is a dependency in target projects**, gitignored by `ae-` prefix.
  See `docs/decisions/0002`. Never change the generated `.gitignore` to ignore
  `.claude/skills/` wholesale: that silently untracks skills the user wrote.
- **Specialists are reference files, not skills.** See `docs/decisions/0001`.
- **Setup is one skill with staged owners.** `ae-setup` is the only entry point;
  its stages are scripts plus `references/stages/*.md`, never sibling skills.
  See `docs/decisions/0003`.
- **Generated artifacts separate fact from judgment.** `knowledge.mjs` and
  `rules.mjs` write only what `analysis.json` proves; the model fills the
  `TODO (judgment)` slots and never edits the facts. A confidently wrong
  knowledge base is worse than none.
- **`${CLAUDE_SKILL_DIR}` always needs a fallback.** It is unset on the 22
  non-Claude tools in `targets.yml` and expands to nothing.
- `VERSION` is the single source of truth. `sync-version.sh` propagates it.
- Shell is bash 3.2 compatible: no associative arrays, no `mapfile`, no
  `sed -i`, POSIX awk only. macOS still ships bash 3.2.
- `.gitattributes` pins `*.sh` to LF. A CRLF script fails with
  `bash: $'\r': command not found` and breaks silently on Windows.
- Never write outside a target project's root. `ae_assert_inside` enforces it.
- `ENGINEERING.md` in a target project is human-owned and never overwritten.
- User content outside managed markers is never modified.

## Adding a tool

Add a block to `skills/ae-setup/references/targets.yml` with its
`instruction_file`, `pointer_style`, `skills_dir`, `detect` list, `confidence`
and `verified` note. No code change. Read `skills_dir` out of the skills CLI's
agent registry rather than from a blog post: that registry is what actually
decides where files land.
