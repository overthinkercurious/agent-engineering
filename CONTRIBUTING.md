# Authoring a skill in this suite

The mechanical half of this document is `scripts/validate-suite.sh`. Run it.

```bash
bash scripts/validate-suite.sh
```

## Is it a skill at all?

Before adding one, check it is not a **specialist**. Specialists are reference
files under `skills/ae-orchestrate/references/specialists/<domain>/`, not
installed skills. `docs/decisions/0001` explains why; the short version is that
eighty installed skills put eighty descriptions in competition to trigger and
about 10k tokens into every session.

A new installed skill is justified when it owns an artifact in the pipeline or
is the entry point. Otherwise it is a specialist or a playbook.

## Anatomy

```
skills/<category>/ae-<name>/
├── SKILL.md            # required
├── scripts/            # optional - deterministic logic
├── references/         # optional - data read at runtime
└── assets/             # optional - files written into target projects
```

Everything the skill needs at runtime goes inside this directory. The skills CLI
copies only the skill directory, so nothing at the repo root is reachable after
install.

## Naming

Install **flattens** the tree: `skills/stages/ae-frame/` lands at
`.claude/skills/ae-frame/`, a directory shared with every other suite the user
has installed and with skills they wrote themselves.

So: prefix every name with `ae-`, keep it unique across the suite, and make it
match the directory name. A bare name like `implement` or `qa` will collide, and
the generated `.gitignore` relies on the prefix to avoid untracking the user's
own skills.

## Frontmatter

`name`, `description` and `owns` are required.

**All "when to use" information lives in the description, not the body.** The
description is the entire triggering mechanism; the body is not read until the
skill has already fired. Models undertrigger skills, so write descriptions
deliberately pushy: name the specific phrasings and contexts that should fire
it, including the case where the user has not explicitly asked. The validator
rejects anything under 120 characters because a short description is a skill
that never fires.

`owns` is a single phrase. Two skills claiming the same ownership is how routing
becomes a guess, so the validator rejects duplicates.

## Body

- Under 500 lines. Past that, split into `references/` with explicit pointers
  about which file to read and when.
- Reference files over 300 lines need a table of contents.
- Imperative voice. Explain *why* a rule matters instead of stacking MUSTs; a
  wall of MUSTs reads as noise and gets skimmed.
- Keep it general. Over-fitting to one example produces a skill that works only
  on that example.
- Never call a bundled script by a path relative to the caller's working
  directory. `bash scripts/x.sh` works until someone runs the skill from
  anywhere else, and the validator rejects it.
- `${CLAUDE_SKILL_DIR}` is Claude Code's, and 22 of the 24 tools in
  `targets.yml` are not Claude Code. On those it is unset, expands to nothing,
  and the path silently becomes `/scripts/...`. So resolve it with a fallback:

  ```bash
  AE="${CLAUDE_SKILL_DIR:-}"
  [ -n "$AE" ] || for d in .claude/skills/ae-setup .agents/skills/ae-setup; do
    [ -f "$d/SKILL.md" ] && AE="$d" && break
  done
  ```

  The validator rejects a bare `${CLAUDE_SKILL_DIR}` with no fallback. Better
  still, depend on it once and then work from `.dev/kit/`, which setup writes
  to a fixed path that survives a clone.

## Rules that are not style

- **No skill invokes another skill.** A specialist that needs another domain
  emits a structured escalation and stops. Direct invocation produces cycles,
  untracked context growth, no budget enforcement and no audit trail.
- **Deterministic before probabilistic.** If a check can be a command with an
  exit code, it must be one. The quality ceiling of the whole system is set by
  how much of it can be verified without a model.
- **Exhaustive method, bounded output.** The checklist in the body is
  exhaustive. The report is capped and ranked by consequence. Fifty findings of
  which three matter is a way to hide the three.
- **Every tool-specific fact goes in `targets.yml`.** Never in script logic.

## Before committing

```bash
npm test          # validate-suite + test-install + test-analyze
```

or individually:

```bash
bash scripts/validate-suite.sh
bash scripts/test-install.sh
```

Add an assertion for the behavior you changed. A fix without a test is a fix
that comes back.
