# 0002 - The installed suite is gitignored, not committed

Date: 2026-09-11
Status: accepted

## Context

A project that installs the suite ends up with skill directories under
`.claude/skills/` and `.agents/skills/`. Those files are the suite's, not the
project's.

Committing them means every target repository carries hundreds of files of
third-party content, and every `npx skills update` produces a large diff that
nobody reviews. Not committing them means the project's history holds only the
project's own code and records.

## Decision

Installed skills are a dependency. The generated `.gitignore` excludes
`.claude/skills/ae-*/`, `.agents/skills/ae-*/` and `.dev/kit/`.

Committed instead: `skills-lock.json`, and everything the project owns.
`AGENTS.md`, `CLAUDE.md`, `ENGINEERING.md`, `.dev/knowledge/`, `.dev/rules/`,
`.dev/tasks/`, `.dev/decisions/` and `.dev/kit-version`.

A fresh clone therefore needs one command to be fully working, and nothing the
project owns needs regenerating.

## Consequences

- Every teammate, fresh clone and CI runner needs network access and one
  command. Air-gapped environments have to vendor the suite deliberately.
- The pointer block in `AGENTS.md` is committed and carries the restore command,
  so the repository tells you how to restore itself.
- Ignore rules are scoped by the `ae-` prefix so that skills the user wrote
  themselves stay tracked. Ignoring `.claude/skills/` wholesale would silently
  stop tracking their own work. Asserted by test 12.
- Ignore rules do not untrack files git already knows about. `doctor.sh` detects
  a previously committed suite and prints the `git rm -r --cached` command.

## Note on restore

`npx skills experimental_install` restores from `skills-lock.json` but writes
only to `.agents/skills/` and ignores `-a`. Claude Code reads only
`.claude/skills/`. Verified 2026-09-11 against skills CLI v1.5.25. So the
documented restore command is `npx skills add ... --copy -y`, the same command
as the first install.
