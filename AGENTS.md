# AGENTS.md

Context for AI tools working on **this repository** (the skill itself), not on
a project the skill is installed into.

## What this repo is

One installed skill, `ae-init`, that indexes a project and writes its knowledge
base and rules. The README states what it does, the scripts define how, and the
test suite defines what "working" means. Nothing outside this repository is
binding on it.

## Layout

| Path | Role |
|---|---|
| `skills/ae-init/SKILL.md` | The entry point. The four-stage chain. |
| `skills/ae-init/scripts/` | Deterministic owners. No model judgment. |
| `skills/ae-init/references/` | Data read at runtime: `targets.yml`, stage docs. |
| `skills/ae-init/assets/` | Templates written into target projects. |
| `scripts/` | Repo maintenance only. Never shipped into a project. |

Everything a skill needs at runtime lives **inside its own directory**. The
skills CLI copies only the skill directory, so a file at the repo root is
unreachable from an installed skill. This is why `targets.yml` sits under
`references/` and not under a top-level `config/`.

## Commands

```bash
npm test                          # all three, in order
bash scripts/validate-suite.sh    # the authoring contract, as an exit code
bash scripts/test-scaffold.sh     # scaffold, doctor, git hygiene, full chain
bash scripts/test-artifacts.sh    # analyzer, knowledge base, rules
```

All three must pass before any commit that touches `skills/` or `scripts/`.

On Git Bash for Windows, set `TMPDIR` to a native path
(`C:/Users/you/AppData/Local/Temp`) first. MSYS translates a path passed as a
whole argument but not one embedded inside a `node -e` string, so the harness
cannot otherwise resolve its own temp files.

The analyzer is Node rather than shell or Python: installing this skill goes
through `npx`, which proves Node exists on the machine. Python does not,
especially on Windows. It has no dependencies.

## Invariants

- **Deterministic before probabilistic.** If a check can be a command with an
  exit code, it must be one. The quality ceiling of the whole system is set by
  how much of it can be verified without a model.
- **Generated artifacts separate fact from judgment.** `knowledge.mjs` and
  `rules.mjs` write only what `analysis.json` proves; the model fills the
  `TODO (judgment)` slots and never edits the facts. A confidently wrong
  knowledge base is worse than none, because everything downstream trusts it.
- **One entry point, staged owners.** The stages are scripts plus
  `references/stages/*.md`, never sibling skills. Skill metadata is always in
  context whether or not the skill fires, and several skills claiming
  overlapping trigger phrases is a coin flip whose loser leaves a half-indexed
  project.
- **No skill invokes another skill.** Escalation is a structured return value.
  Direct invocation produces cycles, untracked context growth, no budget
  enforcement and no audit trail.
- **Skill names are global.** Install flattens the tree into one directory
  shared with every other suite the user has. Every name carries the `ae-`
  prefix, is unique, and matches its directory. `validate-suite.sh` enforces
  all three.
- **The suite is a dependency in target projects**, gitignored by `ae-` prefix.
  Never ignore `.claude/skills/` wholesale: that silently untracks skills the
  user wrote themselves. The generated knowledge base is the opposite — it is
  the deliverable and must stay committed; `doctor.sh` fails if it is ignored.
- **Only scaffold what something reads.** Directories nobody consumes are noise
  in a diff. Add `.dev/tasks/` and friends when the workflow that reads them
  exists.
- **`${CLAUDE_SKILL_DIR}` always needs a fallback.** It is unset on the 22
  non-Claude tools in `targets.yml` and expands to nothing, which silently
  turns a bundled script path into `/scripts/...`.
- **Every tool-specific fact goes in `targets.yml`**, never in script logic.
- Shell is bash 3.2 compatible: no associative arrays, no `mapfile`, no
  `sed -i`, POSIX awk only. macOS still ships bash 3.2.
- `.gitattributes` pins `*.sh` and `*.mjs` to LF. A CRLF script fails with
  `bash: $'\r': command not found` and breaks silently on Windows.
- Never write outside a target project's root. `ae_assert_inside` enforces it.
  Paths are normalised through `cd`/`pwd` because git reports `C:/...` on
  Windows while the shell reports `/c/...`, and comparing the two rejects the
  project's own directories.
- User content outside managed markers is never modified.

## Authoring a skill

Frontmatter needs `name` (matching the directory, `ae-` prefixed), a
`description` long enough to carry the contexts and phrasings that should fire
it, and `owns` (a single phrase; duplicates are rejected, because overlapping
ownership is how routing becomes a guess).

Body under 500 lines. Past that, split into `references/` with explicit
pointers about which file to read and when. Explain *why* a rule matters
instead of stacking MUSTs; a wall of MUSTs reads as noise and gets skimmed.

Never call a bundled script by a path relative to the caller's working
directory. Resolve the skill directory first, with the fallback above.

## Adding a tool

Add a block to `skills/ae-init/references/targets.yml` with its
`instruction_file`, `pointer_style`, `skills_dir`, `detect` list, `confidence`
and `verified` note. No code change. Read `skills_dir` out of the skills CLI's
agent registry rather than from a blog post: that registry is what actually
decides where files land.
